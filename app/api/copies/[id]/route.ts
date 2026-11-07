import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireRole, withApiErrors } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const GET = withApiErrors(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data: copy, error } = await supabase
    .from("copies")
    .select("id, resource_id, status")
    .eq("id", id)
    .single();

  if (error || !copy) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({ copy });
});

const UpdateCopySchema = z.object({
  status: z.literal("available"),
});

// Staff: safely release a copy back to circulation.
export const PATCH = withApiErrors(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requireRole(["staff", "admin"]);

  const parsed = UpdateCopySchema.safeParse(
    await req.json().catch(() => null)
  );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Invalid input. Only status 'available' is allowed. Reservation Queue manages 'held' status.",
      },
      { status: 400 }
    );
  }

  const serviceSupabase = createServiceClient();

  const { data, error } = await serviceSupabase.rpc(
    "set_copy_available_atomic",
    {
      p_copy_id: id,
    }
  );

  if (error) {
    console.error("Atomic copy status update failed:", error);

    if (error.message.includes("COPY_NOT_FOUND")) {
      return NextResponse.json(
        { error: "Copy not found." },
        { status: 404 }
      );
    }

    if (error.message.includes("RESOURCE_NOT_FOUND")) {
      return NextResponse.json(
        { error: "Resource not found." },
        { status: 404 }
      );
    }

    if (error.message.includes("COPY_HAS_ACTIVE_LOAN")) {
      return NextResponse.json(
        {
          error: "Copy has an active loan; return it through the loan return endpoint.",
        },
        { status: 409 }
      );
    }

    if (error.message.includes("COPY_HAS_READY_RESERVATION")) {
      return NextResponse.json(
        {
          error: "Copy is assigned to a ready reservation and cannot be released manually.",
        },
        { status: 409 }
      );
    }

    if (error.message.includes("INVALID_ARGUMENTS")) {
      return NextResponse.json(
        { error: "Invalid copy ID." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update copy status." },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Copy status was not updated." },
      { status: 500 }
    );
  }

  return NextResponse.json({ copy: data });
});