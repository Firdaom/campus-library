"use client";

import { signInWithGoogle } from "@/lib/auth-client";

export function SignInButton() {
  return (
    <button className="btn btn-primary" onClick={() => signInWithGoogle("/dashboard")}>
      Continue with Google
    </button>
  );
}
