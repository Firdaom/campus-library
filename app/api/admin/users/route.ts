import { NextResponse } from "next/server";
import { requireRole, withApiErrors } from "@/lib/auth";

// FR-11 / AC-08: Admin-only list of all accounts.
export const GET = withApiErrors(async () => {
  const { supabase } = await requireRole(["admin"]);

  const { data, error } = await supabase.from("users").select("id, name, role, status").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ users: data });
});
