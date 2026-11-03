/**
 * Student Identity — external, non-human actor (spec section 3 / 9).
 * Confirms a student exists and is eligible to borrow.
 *
 * FR-08 / section 13: if this service is down or times out, the caller must
 * fail CLOSED (treat as not eligible / block borrowing), never silently
 * skip the check.
 *
 * STILL TO CONFIRM (per spec update 2026-10-29): the real endpoint,
 * request/response shape, and auth method used by the Student Identity
 * service. This module is the single place that talks to it — swap the
 * fetch call below once the contract is confirmed; callers only see
 * EligibilityResult.
 */
export interface EligibilityResult {
  eligible: boolean;
  identity_ref?: string;
  reason?: string;
}

const TIMEOUT_MS = 5000;

/**
 * @param identifier The value used to look the student up with the
 *   Student Identity service — currently their university email (from
 *   Google OAuth). Swap for a student-ID field once the real contract is
 *   confirmed, if the service expects something else.
 */
export async function checkStudentEligibility(identifier: string): Promise<EligibilityResult> {
  const url = process.env.STUDENT_IDENTITY_API_URL;
  if (!url) {
    // No contract confirmed yet (spec section 16, Risks / 2026-10-29 update).
    // Throwing here enforces fail-closed behavior rather than silently
    // treating everyone as eligible. Replace with the real integration once
    // the Student Identity pod publishes their API, or point
    // STUDENT_IDENTITY_API_URL at a mock for local/dev.
    throw new Error("Student Identity service is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${url}/eligibility/${encodeURIComponent(identifier)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.STUDENT_IDENTITY_API_KEY}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      // This is a server-only module (see lib/eligibility.ts callers, all of
      // which run in Route Handlers) — never import this from a Client
      // Component, or STUDENT_IDENTITY_API_KEY would ship to the browser.
    });
    if (!res.ok) return { eligible: false, reason: `Student Identity returned ${res.status}` };
    return (await res.json()) as EligibilityResult;
  } finally {
    clearTimeout(timeout);
  }
}
