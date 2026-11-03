"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Calls the real POST /api/loans route so BR-01 (unique-active-loan-per-copy,
// AC-03), BR-03 (eligibility re-check), and the active-loan cap are all
// enforced exactly once, server-side — this button never writes to the
// database directly.
export function CheckoutButton({ copyId, studentId, label }: { copyId: string; studentId: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setPending(true);
    setError(null);

    const res = await fetch("/api/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copy_id: copyId, user_id: studentId }),
    });

    setPending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not check out this copy.");
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <button className="btn btn-primary btn-sm" onClick={handleCheckout} disabled={pending}>
        {pending ? "Checking out…" : label}
      </button>
      {error && (
        <p className="error small" style={{ marginTop: "0.35rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}
