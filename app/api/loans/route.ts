
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, ApiError, withApiErrors } from "@/lib/auth";
import { verifyAndStoreEligibility } from "@/lib/eligibility";
import { createServiceClient } from "@/lib/supabase/server";

const BodySchema = z
  .object({
    copy_id: z.string().uuid().optional(),
    resource_id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
  })
  .refine(
    (data) => Boolean(data.copy_id) !== Boolean(data.resource_id),
    {
      message: "Provide either copy_id or resource_id, not both.",
    }
  );

const LOAN_PERIOD_DAYS = Number(process.env.LOAN_PERIOD_DAYS ?? 14);
const MAX_ACTIVE_LOANS = Number(process.env.MAX_ACTIVE_LOANS ?? 5);

export const POST = withApiErrors(async (req: Request) => {
  // 1. Authenticate the caller using their session.
  const { supabase, user, profile } = await requireUser();

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "Invalid input.",
      },
      { status: 400 }
    );
  }

  const {
    copy_id: copyId,
    resource_id: resourceId,
    user_id: requestedUserId,
  } = parsed.data;

  // 2. Determine who the loan is for.
  let borrowerId: string;

  if (profile.role === "student") {
    if (requestedUserId && requestedUserId !== user.id) {
      throw new ApiError(
        403,
        "Students can only borrow for themselves."
      );
    }

    borrowerId = user.id;
  } else if (
    profile.role === "staff" ||
    profile.role === "admin"
  ) {
    if (!requestedUserId) {
      return NextResponse.json(
        { error: "user_id is required for staff checkout." },
        { status: 400 }
      );
    }

    if (!copyId) {
      return NextResponse.json(
        { error: "copy_id is required for staff checkout." },
        { status: 400 }
      );
    }

    borrowerId = requestedUserId;
  } else {
    throw new ApiError(403, "Role is not allowed to borrow.");
  }


  // 3. Check the borrower's account.
  const { data: borrower, error: borrowerError } = await supabase
    .from("users")
    .select("email, identity_ref, status, role")
    .eq("id", borrowerId)
    .single();

  if (borrowerError || !borrower || borrower.status !== "active") {
    return NextResponse.json(
      { error: "Student account is inactive or unavailable." },
      { status: 403 }
    );
  }

  // Only student accounts may be borrowers.
  // Staff/Admin can perform checkout, but cannot borrow as students.
  if (borrower.role !== "student") {
    return NextResponse.json(
      { error: "Only student accounts are allowed to borrow." },
      { status: 403 }
    );
  }

  // 4. Verify the borrower's university email and Student ID.
  const allowedDomain = (
    process.env.UNIVERSITY_EMAIL_DOMAIN ??
    "lamduan.mfu.ac.th"
  ).toLowerCase();

  const email = (borrower.email ?? "").trim().toLowerCase();
  const emailParts = email.split("@");

  const isUniversityEmail =
    emailParts.length === 2 &&
    emailParts[1] === allowedDomain;

  if (!isUniversityEmail) {
    return NextResponse.json(
      { error: "Only students with a valid university email can borrow." },
      { status: 403 }
    );
  }

  // Student ID must be exactly 10 digits.
  const studentId = /^\d{10}$/.test(emailParts[0])
    ? emailParts[0]
    : "";

  if (!studentId) {
    return NextResponse.json(
      { error: "Cannot determine a valid Student ID from the university email." },
      { status: 403 }
    );
  }

  // Fail closed if the stored identity reference conflicts with the email.
  if (borrower.identity_ref && borrower.identity_ref !== studentId) {
    return NextResponse.json(
      { error: "Student ID does not match the stored identity reference." },
      { status: 403 }
    );
  }

  // Verify eligibility again at the moment of borrowing.
  const eligibility = await verifyAndStoreEligibility(
    supabase,
    borrowerId,
    studentId
  );

  if (!eligibility.eligible) {
    return NextResponse.json(
      {
        error:
          eligibility.reason ??
          "Student ineligible or not yet verified.",
      },
      { status: 403 }
    );
  }



  // 5. Calculate the due date.
  const dueAt = new Date(
    Date.now() + LOAN_PERIOD_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // 6. Call the atomic database function using the service-role client.
  // The service-role key is used only on the server.
  const serviceSupabase = createServiceClient();

  const { data, error } = await serviceSupabase.rpc(
    "create_loan_atomic",
    {
      p_user_id: borrowerId,
      p_copy_id: copyId ?? null,
      p_resource_id: resourceId ?? null,
      p_due_at: dueAt,
      p_max_active_loans: MAX_ACTIVE_LOANS,
    }
  );

  // 7. Map database errors to appropriate HTTP responses.
  if (error) {
    console.error("Atomic borrow failed:", error);

    const message = error.message ?? "";

    if (message.includes("STUDENT_INACTIVE")) {
      return NextResponse.json(
        { error: "Student account is inactive." },
        { status: 403 }
      );
    }

    if (message.includes("STUDENT_INELIGIBLE")) {
      return NextResponse.json(
        { error: "Student is not eligible to borrow." },
        { status: 403 }
      );
    }

    if (
      message.includes("COPY_UNAVAILABLE") ||
      message.includes("NO_AVAILABLE_COPY")
    ) {
      return NextResponse.json(
        { error: "No available copy. Please try again." },
        { status: 409 }
      );
    }

    if (message.includes("DUPLICATE_RESOURCE_LOAN")) {
      return NextResponse.json(
        { error: "You already have an active loan for this book." },
        { status: 409 }
      );
    }

    if (message.includes("MAX_ACTIVE_LOANS_REACHED")) {
      return NextResponse.json(
        {
          error: `Student already has the maximum of ${MAX_ACTIVE_LOANS} active loans.`,
        },
        { status: 409 }
      );
    }

    if (
      message.includes("INVALID_ARGUMENTS") ||
      message.includes("PROVIDE_COPY_OR_RESOURCE")
    ) {
      return NextResponse.json(
        { error: "Invalid borrow request." },
        { status: 400 }
      );
    }

    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Copy is already borrowed." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Could not complete the borrow request." },
      { status: 500 }
    );
  }

  // RPC RETURNS TABLE, so Supabase normally returns an array.
  const loan = Array.isArray(data) ? data[0] : data;

  if (!loan) {
    console.error("Atomic borrow returned no loan data.");

    return NextResponse.json(
      { error: "Borrow completed without a loan record." },
      { status: 500 }
    );
  }

  // FR-09: Due and overdue notifications are handled by the daily cron,
  // not at the moment of borrowing.

  return NextResponse.json({ loan }, { status: 201 });
});
