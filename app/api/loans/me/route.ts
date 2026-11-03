import { NextResponse } from "next/server";
import { requireUser, withApiErrors } from "@/lib/auth";

// FR-07 / AC-00: a student's own current and past loans. RLS
// (loans_select_own) also enforces this at the DB level.
export const GET = withApiErrors(async () => {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("loans")
    .select("id, due_at, returned_at, status, copy_id")
    .eq("user_id", user.id)
    .order("borrowed_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ loans: data });
});
