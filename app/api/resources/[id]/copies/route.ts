import { NextResponse } from "next/server";
import { requireUser, requireRole, withApiErrors } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

// Anyone authenticated can list a resource's copies (same visibility as
// GET /resources/{id}, which already includes this — this route exists
// separately so staff tooling has a dedicated "manage copies" endpoint).
export const GET = withApiErrors(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data: copies, error } = await supabase
    .from("copies")
    .select("id, resource_id, status")
    .eq("resource_id", id)
    .order("status");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ copies });
});


// Staff: add a new physical copy atomically.
export const POST = withApiErrors(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requireRole(["staff", "admin"]);

  const serviceSupabase = createServiceClient();

  const { data, error } = await serviceSupabase.rpc(
    "add_copy_atomic",
    {
      p_resource_id: id,
    }
  );

  if (error) {
    console.error("Atomic copy creation failed:", error);

    if (error.message.includes("RESOURCE_NOT_FOUND")) {
      return NextResponse.json(
        { error: "Resource not found." },
        { status: 404 }
      );
    }

    if (error.message.includes("INVALID_ARGUMENTS")) {
      return NextResponse.json(
        { error: "Invalid resource ID." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to add copy." },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Copy was not created." },
      { status: 500 }
    );
  }

  return NextResponse.json({ copy: data }, { status: 201 });
});