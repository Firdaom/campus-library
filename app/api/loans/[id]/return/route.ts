
import { NextResponse } from "next/server";
import { requireRole, withApiErrors } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const PATCH = withApiErrors(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    await requireRole(["staff", "admin"]);

    const supabase = createServiceClient();

    const { data, error } = await supabase.rpc("return_loan_atomic", {
      p_loan_id: id,
    });

    if (error) {
      console.error("Atomic loan return failed:", error);

      const message = error.message ?? "";

      if (message.includes("LOAN_NOT_FOUND")) {
        return NextResponse.json(
          { error: "Loan not found." },
          { status: 404 }
        );
      }

      if (
        message.includes("LOAN_ALREADY_RETURNED") ||
        message.includes("COPY_INVALID")
      ) {
        return NextResponse.json(
          { error: "Loan already returned or copy is unavailable." },
          { status: 409 }
        );
      }

      if (message.includes("INVALID_ARGUMENTS")) {
        return NextResponse.json(
          { error: "Invalid loan ID." },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: "Unable to return loan." },
        { status: 500 }
      );
    }

    const result = data?.[0];

    if (!result) {
      return NextResponse.json(
        { error: "Loan return failed." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      loan: {
        id: result.loan_id,
        returned_at: result.returned_at,
      },
      reservation: result.promoted_reservation_id
        ? {
            id: result.promoted_reservation_id,
            user_id: result.promoted_user_id,
            expires_at: result.expires_at,
          }
        : null,
    });
  }
);
