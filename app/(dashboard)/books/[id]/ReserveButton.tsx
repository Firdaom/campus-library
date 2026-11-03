"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Calls the real POST /api/reservations route (not a direct Supabase
// write) so BR-02 (no reservations while a copy is available) and AC-04b
// (no duplicate pending reservation) are enforced exactly once, server-side.
export function ReserveButton({ resourceId, alreadyReserved }: { resourceId: string; alreadyReserved: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (alreadyReserved) {
    return <p className="muted small">You already have a pending reservation for this book.</p>;
  }

  async function handleReserve() {
    setPending(true);
    setError(null);

    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource_id: resourceId }),
    });

    setPending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not reserve this book.");
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <button className="btn btn-primary" onClick={handleReserve} disabled={pending}>
        {pending ? "Reserving…" : "Reserve this book"}
      </button>
      {error && (
        <p className="error small" style={{ marginTop: "0.5rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}
