
import { NextResponse } from "next/server";
import { requireUser, withApiErrors } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

// FR-07 / AC-05: a student can cancel their own pending or ready reservation.
// Cancellation and FIFO queue promotion happen atomically in the database.
export const DELETE = withApiErrors(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { user } = await requireUser();

    const supabase = createServiceClient();

    const { error } = await supabase.rpc("cancel_reservation_atomic", {
      p_reservation_id: id,
      p_user_id: user.id,
    });

    if (error) {
      console.error("Atomic reservation cancellation failed:", error);

      const message = error.message ?? "";

      if (message.includes("RESERVATION_NOT_FOUND_OR_NOT_OWNER")) {
        return NextResponse.json(
          { error: "Reservation not found." },
          { status: 404 }
        );
      }

      if (message.includes("RESERVATION_NOT_CANCELLABLE")) {
        return NextResponse.json(
          { error: "Only pending or ready reservations can be cancelled." },
          { status: 409 }
        );
      }

      if (message.includes("INVALID_ARGUMENTS")) {
        return NextResponse.json(
          { error: "Invalid reservation ID." },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: "Unable to cancel reservation." },
        { status: 500 }
      );
    }

    return new NextResponse(null, { status: 204 });
  }
);
