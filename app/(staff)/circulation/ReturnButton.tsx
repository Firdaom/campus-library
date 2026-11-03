"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Calls PATCH /api/loans/{id}/return — the route that also frees the copy
// and, if a reservation is waiting, moves it to 'ready' (BR-04/BR-05).
export function ReturnButton({ loanId }: { loanId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReturn() {
    setPending(true);
    setError(null);

    const res = await fetch(`/api/loans/${loanId}/return`, { method: "PATCH" });

    setPending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not return this loan.");
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={handleReturn} disabled={pending}>
        {pending ? "Returning…" : "Return"}
      </button>
      {error && (
        <p className="error small" style={{ marginTop: "0.35rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}
