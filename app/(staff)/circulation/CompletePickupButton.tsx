"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// FR-05: completes checkout for a reservation that's already 'ready' —
// calls POST /api/reservations/{id}/checkout, which verifies the
// reservation is ready, its held copy, and that it belongs to this
// student, then creates the loan (all server-side; this button never
// writes to the database directly).
export function CompletePickupButton({ reservationId, studentId }: { reservationId: string; studentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleComplete() {
    setPending(true);
    setError(null);

    const res = await fetch(`/api/reservations/${reservationId}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: studentId }),
    });

    setPending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not complete this pickup.");
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <button className="btn btn-primary btn-sm" onClick={handleComplete} disabled={pending}>
        {pending ? "Completing…" : "Complete pickup"}
      </button>
      {error && (
        <p className="error small" style={{ marginTop: "0.35rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}
