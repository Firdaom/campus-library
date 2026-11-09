
"use client";

import { signInWithGoogle } from "@/lib/auth-client";

type Portal = "student" | "staff";

export function SignInButton({ portal }: { portal: Portal }) {
  return (
    <button
      className="btn btn-primary"
      onClick={() => signInWithGoogle(portal)}
    >
      Continue with Google
    </button>
  );
}
