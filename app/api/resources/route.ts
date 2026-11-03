import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireRole, withApiErrors } from "@/lib/auth";

// FR-01 / AC-01: search resources by title/keyword, return availability.
export const GET = withApiErrors(async (req: Request) => {
  const { supabase } = await requireUser();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const category = searchParams.get("category")?.trim();

  if (q !== undefined && q.length > 200) {
    return NextResponse.json({ error: "Search query too long." }, { status: 400 });
  }

  let query = supabase.from("resource_availability").select("*").order("title");
  if (q) query = query.ilike("title", `%${q}%`);
  if (category) query = query.eq("category", category);

  const { data, error } = await query.limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ resources: data });
});

const CreateResourceSchema = z.object({
  title: z.string().min(1).max(500),
  category: z.string().min(1).max(100),
  author: z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
});

// Staff APIs for managing resources (2026-10-29 addition, still not
// complete per the team's "Status" note — this covers create; see
// app/api/resources/[id]/route.ts PATCH for update). requireRole is the
// application-level check; resources_write_staff_admin in db/schema.sql is
// the corresponding database-level enforcement (defense in depth — a
// student token can't write even if this check were ever bypassed).
export const POST = withApiErrors(async (req: Request) => {
  const { supabase } = await requireRole(["staff", "admin"]);

  const parsed = CreateResourceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: resource, error } = await supabase
    .from("resources")
    .insert(parsed.data)
    .select("id, title, category, author, description")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ resource }, { status: 201 });
});
