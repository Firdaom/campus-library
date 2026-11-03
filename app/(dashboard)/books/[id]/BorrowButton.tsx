"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// FR-01: self-service borrow. Calls POST /api/loans with resource_id (not a
// specific copy_id) — the server picks an available copy, re-verifies
// eligibility, and enforces the active-loan cap, all server-side (this
// button never writes to the database directly).
export function BorrowButton({ resourceId }: { resourceId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBorrow() {
    setPending(true);
    setError(null);

    const res = await fetch("/api/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource_id: resourceId }),
    });

    setPending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not borrow this book.");
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <button className="btn btn-primary" onClick={handleBorrow} disabled={pending}>
        {pending ? "Borrowing…" : "Borrow this book"}
      </button>
      {error && (
        <p className="error small" style={{ marginTop: "0.5rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}
