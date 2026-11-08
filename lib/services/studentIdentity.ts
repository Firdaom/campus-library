
export interface EligibilityResult {
  eligible: boolean;
  identity_ref?: string;
  reason?: string;
}

interface StudentIdentityResponse {
  studentId: string;
  claims: {
    verified: boolean;
    name?: {
      first: string;
      last: string;
    };
    profileComplete?: boolean;
    missingFields?: string[];
    skills?: string[];
  };
  issuedAt: string;
}

const TIMEOUT_MS = 60_000;

export async function checkStudentEligibility(
  studentId: string
): Promise<EligibilityResult> {
  const baseUrl = process.env.STUDENT_IDENTITY_API_URL;
  const apiKey = process.env.STUDENT_IDENTITY_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("Student Identity API is not configured.");
  }

  if (!/^\d{10}$/.test(studentId)) {
    return {
      eligible: false,
      reason: "Invalid student ID.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/students/${encodeURIComponent(studentId)}/claims`,
      {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const reasons: Record<number, string> = {
        401: "Student Identity API authentication failed.",
        403: "Student has not consented to Student Identity.",
        404: "Student ID was not found.",
      };

      return {
        eligible: false,
        reason:
          reasons[res.status] ??
          `Student Identity returned HTTP ${res.status}.`,
      };
    }

    const data = (await res.json()) as StudentIdentityResponse;

    if (
      data.studentId !== studentId ||
      typeof data.claims?.verified !== "boolean"
    ) {
      throw new Error("Invalid Student Identity API response.");
    }

    return {
      eligible: data.claims.verified,
      identity_ref: data.studentId,
      reason: data.claims.verified
        ? undefined
        : "Student Identity verification failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
