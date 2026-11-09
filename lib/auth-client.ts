
"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Starts Google OAuth.
 * The callback determines the destination from the user's actual database role.
 */
export async function signInWithGoogle() {
  const supabase = createClient();

  const callbackUrl = new URL(
    "/auth/callback",
    window.location.origin
  );

  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
}
