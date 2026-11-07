import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireRole, withApiErrors } from "@/lib/auth";

// FR-02 / FR-10: resource detail, copy availability, and recommendations.
export const GET = withApiErrors(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data: resource, error: resourceError } = await supabase
    .from("resources")
    .select("*")
    .eq("id", id)
    .single();

  if (resourceError || !resource) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: copies, error: copiesError } = await supabase
    .from("copies")
    .select("id, status")
    .eq("resource_id", id);

  if (copiesError) return NextResponse.json({ error: copiesError.message }, { status: 400 });

  return NextResponse.json({ resource, copies });
});

const UpdateResourceSchema = z
  .object({
    title: z.string().min(1).max(500),
    category: z.string().min(1).max(100),
    author: z.string().max(300).nullable(),
    description: z.string().max(5000).nullable(),
  })
  .partial();

// Staff: update a resource's catalog fields.
export const PATCH = withApiErrors(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { supabase } = await requireRole(["staff", "admin"]);

  const parsed = UpdateResourceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const { data: resource, error } = await supabase
    .from("resources")
    .update(parsed.data)
    .eq("id", id)
    .select("id, title, category, author, description")
    .single();

  if (error || !resource) return NextResponse.json({ error: "Resource not found." }, { status: 404 });

  return NextResponse.json({ resource });
});
