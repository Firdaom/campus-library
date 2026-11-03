import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyAndStoreEligibility } from "@/lib/eligibility";

/**
 * Google OAuth callback (FR-00 / FR-08, 2026-10-29 update).
 *
 * 1. Exchanges the OAuth `code` for a Supabase session (creates the
 *    auth.users + public.users rows on first sign-in, via the DB trigger).
 * 2. Enforces the university email domain, once UNIVERSITY_EMAIL_DOMAIN is
 *    confirmed and set — until then this step is skipped (see "Still to
 *    confirm" in the spec).
 * 3. Verifies eligibility with the Student Identity service and persists
 *    it on the profile (lib/eligibility.ts) so later reads (e.g. showing a
 *    banner) don't need another round trip. Borrowing itself re-verifies
 *    at loan time regardless of this cached value (POST /api/loans).
 */
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const email = data.user.email ?? "";
  const allowedDomain = process.env.UNIVERSITY_EMAIL_DOMAIN; // e.g. "lamduan.mfu.ac.th" — still to confirm

  if (allowedDomain && !email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/auth/auth-code-error?reason=domain`);
  }

  // FR-08: verify eligibility right after sign-in. Fail-closed is handled
  // inside verifyAndStoreEligibility — an unverifiable student is stored
  // (and treated) as ineligible rather than defaulting to eligible.
  await verifyAndStoreEligibility(supabase, data.user.id, email);

  return NextResponse.redirect(`${origin}${next}`);
}
