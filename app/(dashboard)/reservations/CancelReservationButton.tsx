"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Calls DELETE /api/reservations/{id} so ownership (AC-05) and the
// pending-only restriction are enforced server-side / by RLS, not just by
// this button being hidden for other statuses.
export function CancelReservationButton({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleCancel() {
    if (!window.confirm("Cancel this reservation?")) return;

    setPending(true);
    const res = await fetch(`/api/reservations/${reservationId}`, { method: "DELETE" });
    setPending(false);

    if (res.ok) router.refresh();
  }

  return (
    <button className="btn btn-ghost btn-sm" onClick={handleCancel} disabled={pending}>
      {pending ? "Cancelling…" : "Cancel"}
    </button>
  );
}
