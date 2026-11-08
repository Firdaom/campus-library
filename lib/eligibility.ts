
import { SupabaseClient } from "@supabase/supabase-js";
import { checkStudentEligibility } from "@/lib/services/studentIdentity";

/**
 * Verifies a student's borrowing eligibility and persists the result.
 *
 * Called:
 * 1. After Google sign-in.
 * 2. Again immediately before borrowing.
 *
 * Fails closed if the Student Identity service or profile update fails.
 */
export async function verifyAndStoreEligibility(
  supabase: SupabaseClient,
  userId: string,
  studentId: string
): Promise<{ eligible: boolean; reason?: string }> {
  let result: {
    eligible: boolean;
    identity_ref?: string;
    reason?: string;
  };

  try {
    result = await checkStudentEligibility(studentId);
  } catch {
    result = {
      eligible: false,
      reason: "Student Identity service unavailable.",
    };
  }

  const validStudentId = /^\d{10}$/.test(studentId);

  const { error: updateError } = await supabase
    .from("users")
    .update({
      eligibility_status: result.eligible ? "eligible" : "ineligible",
      eligibility_checked_at: new Date().toISOString(),
      identity_ref: validStudentId
        ? result.identity_ref ?? studentId
        : null,
    })
    .eq("id", userId);

  if (updateError) {
    console.error("Failed to update student eligibility:", updateError);

    return {
      eligible: false,
      reason: "Could not save student eligibility.",
    };
  }

  return {
    eligible: result.eligible,
    reason: result.reason,
  };
}
