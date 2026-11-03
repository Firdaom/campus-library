"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * FR-00 (2026-10-29 update): single "Continue with Google" button for both
 * new and returning students — Supabase Auth's Google OAuth provider
 * creates the auth.users row on first sign-in automatically, and the
 * handle_new_auth_user trigger (db/schema.sql) creates the matching
 * public.users profile row, so there is no separate register/login flow.
 *
 * Call this from the button's onClick. It redirects the browser to Google;
 * Google redirects back to /auth/callback, which exchanges the code for a
 * session and runs the eligibility check.
 */
export async function signInWithGoogle(nextPath = "/") {
  const supabase = createClient();
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      // Restrict the Google account picker to the campus domain once it's
      // confirmed (section "Still to confirm"). hd is a UX hint only —
      // app/auth/callback/route.ts enforces the real check server-side.
      queryParams: process.env.NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN
        ? { hd: process.env.NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN }
        : undefined,
    },
  });
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
}
