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
  // ordering BR-05/FR-12 use when a copy frees up). Previously one COUNT
  // query per pending row (N+1); now a single query for all the resources
  // involved, counted in memory with the same "created_at < mine" rule.
  const pendingRows = (reservations ?? []).filter((r: any) => r.status === "pending");
  const resourceIds = [...new Set(pendingRows.map((r: any) => r.resource_id as string))];

  const queueByResource = new Map<string, string[]>();
  if (resourceIds.length > 0) {
    const { data: queue } = await supabase
      .from("reservations")
      .select("resource_id, created_at")
      .in("resource_id", resourceIds)
      .eq("status", "pending");

    for (const q of queue ?? []) {
      const list = queueByResource.get(q.resource_id);
      if (list) list.push(q.created_at);
      else queueByResource.set(q.resource_id, [q.created_at]);
    }
  }

  const rows = (reservations ?? []).map((r: any) => {
    if (r.status !== "pending") return { ...r, position: null as number | null };
    const mine = timestampKey(r.created_at);
    const earlier = (queueByResource.get(r.resource_id) ?? []).filter(
      (createdAt) => timestampKey(createdAt) < mine
    ).length;
    return { ...r, position: earlier + 1 };
  });

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

/**
 * Orders Postgres timestamptz strings exactly (microsecond precision), the
 * same way the old `.lt("created_at", ...)` filter did in the database.
 * `Date` alone would truncate to milliseconds and could mis-order two rows
 * created within the same millisecond.
 */
function timestampKey(value: string): number {
  const micros = /\.(\d+)/.exec(value)?.[1] ?? "";
  const sub = Number(micros.padEnd(6, "0").slice(0, 6)) % 1000;
  return Date.parse(value) * 1000 + sub;
}
