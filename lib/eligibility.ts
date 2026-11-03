import { SupabaseClient } from "@supabase/supabase-js";
import { checkStudentEligibility } from "@/lib/services/studentIdentity";

/**
 * Verifies a user's borrowing eligibility with the Student Identity service
 * and persists the result on their profile row. Used in two places per the
 * 2026-10-29 spec update:
 *   1. Right after Google sign-in (app/auth/callback/route.ts)
 *   2. Again at the moment of borrowing (POST /api/loans) — eligibility can
 *      change between sign-in and a loan weeks later, so it's re-checked,
 *      not just read from the cached column.
 *
 * Fails CLOSED: if the Student Identity call errors or times out, the user
 * is recorded (and returned) as NOT eligible, so borrowing stays blocked
 * until verification succeeds — never silently skipped.
 */
export async function verifyAndStoreEligibility(
  supabase: SupabaseClient,
  userId: string,
  identifier: string
): Promise<{ eligible: boolean; reason?: string }> {
  let result: { eligible: boolean; identity_ref?: string; reason?: string };

  try {
    result = await checkStudentEligibility(identifier);
  } catch {
    result = { eligible: false, reason: "Student Identity service unavailable." };
  }

  await supabase
    .from("users")
    .update({
      eligibility_status: result.eligible ? "eligible" : "ineligible",
      eligibility_checked_at: new Date().toISOString(),
      identity_ref: result.identity_ref ?? undefined,
    })
    .eq("id", userId);

  return { eligible: result.eligible, reason: result.reason };
}
