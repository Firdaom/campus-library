"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

// Shared by app/(dashboard)/layout.tsx and app/(staff)/layout.tsx — moved
// here (out of the (dashboard) route group) so both sidebars can import the
// same component without reaching across route groups.
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <button className="btn btn-ghost" onClick={handleSignOut} disabled={pending}>
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}
