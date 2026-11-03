import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, withApiErrors } from "@/lib/auth";

const BodySchema = z.object({ role: z.enum(["student", "staff", "admin"]) });

// FR-11 / AC-08: Admin-only role change. Also enforced by RLS
// (users_admin_update_any), so this is defense in depth, not the only check.
export const PATCH = withApiErrors(async (req: Request, { params }: { params: { id: string } }) => {
  const { supabase } = await requireRole(["admin"]);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const { data: user, error } = await supabase
    .from("users")
    .update({ role: parsed.data.role })
    .eq("id", params.id)
    .select("id, role")
    .single();

  if (error || !user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  return NextResponse.json({ user });
});
