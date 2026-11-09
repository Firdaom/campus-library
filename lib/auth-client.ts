
"use client";

import { createClient } from "@/lib/supabase/client";

type Portal = "student" | "staff";

/**
 * Starts Google OAuth for the selected portal.
 * The portal is only a requested destination, never a role or permission.
 * The callback must verify the actual role from the database.
 */
export async function signInWithGoogle(portal: Portal) {
  const supabase = createClient();

  const callbackUrl = new URL(
    "/auth/callback",
    window.location.origin
  );

  callbackUrl.searchParams.set("portal", portal);

  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      queryParams:
        portal === "student" &&
        process.env.NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN
          ? {
              hd: process.env.NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN,
            }
          : undefined,
    },
  });
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
}
