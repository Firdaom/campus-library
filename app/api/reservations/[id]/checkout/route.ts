
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, withApiErrors } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

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

    const dueAt = new Date(
      Date.now() + LOAN_PERIOD_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    // Use service_role only on the server to call the protected RPC.
    const serviceSupabase = createServiceClient();

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
