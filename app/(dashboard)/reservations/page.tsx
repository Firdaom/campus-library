import { requireDashboardUser } from "@/lib/currentUser";
import { CancelReservationButton } from "./CancelReservationButton";

// My Reservations: reservation records and queue status (FR-05, FR-06,
// FR-13, AC-10).
export default async function ReservationsPage() {
  const { supabase, user } = await requireDashboardUser();

  const { data: reservations, error } = await supabase
    .from("reservations")
    .select("id, status, created_at, expires_at, resource_id, resources(title)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Queue position for 'pending' reservations: how many OTHER pending
  // reservations for the same resource were created earlier (FIFO, same
  // ordering BR-05/FR-12 use when a copy frees up). One query per pending
  // row is fine at this scale — replace with a window function or a view
  // if the catalog/queue sizes grow.
  const rows = await Promise.all(
    (reservations ?? []).map(async (r: any) => {
      if (r.status !== "pending") return { ...r, position: null as number | null };
      const { count } = await supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("resource_id", r.resource_id)
        .eq("status", "pending")
        .lt("created_at", r.created_at);
      return { ...r, position: (count ?? 0) + 1 };
    })
  );

  return (
    <div>
      <h1>My Reservations</h1>

      {error && <p className="error">{error.message}</p>}

      {rows.length === 0 ? (
        <p className="muted">No reservations — reserve a book from its detail page when all copies are on loan.</p>
      ) : (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id} className="reservation-row">
              <div>
                <strong>{r.resources?.title ?? "Resource"}</strong>
                <div className="muted small">
                  {r.status === "pending" && `Queue position #${r.position}`}
                  {r.status === "ready" &&
                    `Ready for pickup — hold expires ${r.expires_at ? new Date(r.expires_at).toLocaleString() : "soon"}`}
                  {r.status === "cancelled" && "Cancelled"}
                  {r.status === "expired" && "Expired — not claimed within 48 hours"}
                  {r.status === "fulfilled" && "Fulfilled"}
                </div>
              </div>
              <div className="row-actions">
                <span className={`badge ${statusBadgeClass(r.status)}`}>{r.status}</span>
                {(r.status === "pending" || r.status === "ready") && (
                  <CancelReservationButton reservationId={r.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "ready":
      return "badge-success";
    case "pending":
      return "badge-info";
    case "expired":
    case "cancelled":
      return "badge-muted";
    default:
      return "badge-default";
  }
}
