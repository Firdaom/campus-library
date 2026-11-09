
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, withApiErrors } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyAndStoreEligibility } from "@/lib/eligibility";

const BodySchema = z.object({
  user_id: z.string().uuid(),
});

const LOAN_PERIOD_DAYS = Number(process.env.LOAN_PERIOD_DAYS ?? 14);
const MAX_ACTIVE_LOANS = Number(process.env.MAX_ACTIVE_LOANS ?? 5);

const ERROR_RESPONSES: Record<string, { status: number; message: string }> = {
  INVALID_ARGUMENTS: {
    status: 400,
    message: "Invalid checkout information.",
  },
  STUDENT_INACTIVE: {
    status: 403,
    message: "This student's account is inactive.",
  },
  STUDENT_INELIGIBLE: {
    status: 403,
    message: "This student is not eligible to borrow books.",
  },
  RESERVATION_NOT_FOUND: {
    status: 404,
    message: "Reservation not found.",
  },
  RESERVATION_USER_MISMATCH: {
    status: 403,
    message: "This reservation belongs to a different student.",
  },
  RESERVATION_NOT_READY: {
    status: 409,
    message: "This reservation is no longer ready for pickup.",
  },
  RESERVATION_COPY_MISSING: {
    status: 409,
    message: "No copy is assigned to this reservation.",
  },
  COPY_NOT_HELD: {
    status: 409,
    message: "The reserved copy is no longer available for checkout.",
  },
  RESERVATION_EXPIRED_HAS_QUEUE: {
    status: 409,
    message: "This reservation has expired and another student is waiting.",
  },
  DUPLICATE_RESOURCE_LOAN: {
    status: 409,
    message: "This student already has an active loan for this book.",
  },
  MAX_ACTIVE_LOANS_REACHED: {
    status: 409,
    message: "This student has reached the maximum number of active loans.",
  },
};

export const POST = withApiErrors(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    // Only staff and admins can complete reservation checkout.
    await requireRole(["staff", "admin"]);

    const parsed = BodySchema.safeParse(
      await req.json().catch(() => null)
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: "user_id is required." },
        { status: 400 }
      );
    }

    const { user_id } = parsed.data;
    // Verify borrower account and student identity before checkout.
    const serviceSupabase = createServiceClient();

    const { data: borrower, error: borrowerError } = await serviceSupabase
      .from("users")
      .select("email, identity_ref, status, role")
      .eq("id", user_id)
      .single();

    if (borrowerError || !borrower || borrower.status !== "active") {
      return NextResponse.json(
        { error: "Student account is inactive or unavailable." },
        { status: 403 }
      );
    }

    if (borrower.role !== "student") {
      return NextResponse.json(
        { error: "Only student accounts are allowed to borrow." },
        { status: 403 }
      );
    }

    // Verify university email.
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

    // Extract the 10-digit Student ID from university email.
    const studentId = /^\d{10}$/.test(emailParts[0])
      ? emailParts[0]
      : "";

    if (!studentId) {
      return NextResponse.json(
        { error: "Cannot determine a valid Student ID from the university email." },
        { status: 403 }
      );
    }

    // Ensure the Student ID matches the stored identity reference.
    if (borrower.identity_ref && borrower.identity_ref !== studentId) {
      return NextResponse.json(
        { error: "Student ID does not match the stored identity reference." },
        { status: 403 }
      );
    }

    // Re-verify eligibility immediately before completing pickup.
    const eligibility = await verifyAndStoreEligibility(
      serviceSupabase,
      user_id,
      studentId
    );

    if (!eligibility.eligible) {
      return NextResponse.json(
        {
          error:
            eligibility.reason ??
            "Student is not eligible to borrow books.",
        },
        { status: 403 }
      );
    }

    const dueAt = new Date(
      Date.now() + LOAN_PERIOD_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await serviceSupabase.rpc(
      "checkout_reservation_atomic",
      {
        p_reservation_id: id,
        p_user_id: user_id,
        p_due_at: dueAt,
        p_max_active_loans: MAX_ACTIVE_LOANS,
      }
    );

    if (error) {
      const errorCode = Object.keys(ERROR_RESPONSES).find((code) =>
        error.message.includes(code)
      );

      if (errorCode) {
        const response = ERROR_RESPONSES[errorCode];

        return NextResponse.json(
          { error: response.message },
          { status: response.status }
        );
      }

      // Handle the unique active-loan-per-copy constraint.
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This copy already has an active loan." },
          { status: 409 }
        );
      }

      console.error("Atomic reservation checkout failed:", error);

      return NextResponse.json(
        { error: "Failed to complete reservation checkout." },
        { status: 500 }
      );
    }

    const loan = Array.isArray(data) ? data[0] : data;

    if (!loan) {
      return NextResponse.json(
        { error: "Checkout completed without returning loan details." },
        { status: 500 }
      );
    }

    return NextResponse.json({ loan }, { status: 201 });
  }
);
