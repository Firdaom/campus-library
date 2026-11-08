
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyAndStoreEligibility } from "@/lib/eligibility";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const email = data.user.email ?? "";
  const allowedDomain =
    process.env.UNIVERSITY_EMAIL_DOMAIN ?? "lamduan.mfu.ac.th";

  if (
    !email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`)
  ) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${origin}/auth/auth-code-error?reason=domain`
    );
  }

  // Extract the 10-digit Student ID from the university email.
  const match = email.match(/^(\d{10})@lamduan\.mfu\.ac\.th$/i);
  const studentId = match?.[1] ?? "";

  // Verify eligibility and persist the Student ID.
  // Invalid email format or unavailable API fails closed.
  await verifyAndStoreEligibility(
    supabase,
    data.user.id,
    studentId
  );

  return NextResponse.redirect(`${origin}${next}`);
}
