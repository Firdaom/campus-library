
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, withApiErrors } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  resource_id: z.string().uuid(),
});

// FR-05 / BR-02: students can reserve a resource only when
// no available copies exist.
export const POST = withApiErrors(async (req: Request) => {
  const { user } = await requireRole(["student"]);

  const parsed = BodySchema.safeParse(
    await req.json().catch(() => null)
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input." },
      { status: 400 }
    );
  }

  const { resource_id } = parsed.data;

  // Call the atomic database function using the server-side service role.
  const serviceSupabase = createServiceClient();

  const { data, error } = await serviceSupabase.rpc(
    "create_reservation_atomic",
    {
      p_resource_id: resource_id,
      p_user_id: user.id,
    }
  );

  if (error) {
    if (error.message.includes("RESOURCE_NOT_FOUND")) {
      return NextResponse.json(
        { error: "Resource not found." },
        { status: 404 }
      );
    }

    if (error.message.includes("COPY_AVAILABLE")) {
      return NextResponse.json(
        {
          error: "A copy is currently available; reservation not needed.",
        },
        { status: 409 }
      );
    }

    if (error.message.includes("DUPLICATE_RESOURCE_LOAN")) {
      return NextResponse.json(
        {
          error: "You already have an active loan for this book.",
        },
        { status: 409 }
      );
    }

    if (
      error.message.includes("duplicate key") ||
      error.code === "23505"
    ) {
      return NextResponse.json(
        { error: "Already reserved." },
        { status: 409 }
      );
    }

    if (error.message.includes("INVALID_ARGUMENTS")) {
      return NextResponse.json(
        { error: "Invalid reservation information." },
        { status: 400 }
      );
    }

    console.error("Atomic reservation creation failed:", error);

    return NextResponse.json(
      { error: "Failed to create reservation." },
      { status: 500 }
    );
  }

  const reservation = Array.isArray(data) ? data[0] : data;

  if (!reservation) {
    return NextResponse.json(
      { error: "Reservation was not created." },
      { status: 500 }
    );
  }

  return NextResponse.json({ reservation }, { status: 201 });
});

// FR-13 / AC-10: a student's own reservations with status.
export const GET = withApiErrors(async () => {
  const { supabase, user } = await requireRole(["student"]);

  const { data, error } = await supabase
    .from("reservations")
    .select("id, resource_id, status, created_at, ready_at, expires_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ reservations: data });
});
