import { requireStaffUser } from "@/lib/currentUser";
import { CompletePickupButton } from "../../circulation/CompletePickupButton";

export default async function ReservationManagementPage() {
  const { supabase } = await requireStaffUser();

  const { data, error } = await supabase
    .from("reservations")
    .select(`
      id,
      user_id,
      status,
      created_at,
      ready_at,
      expires_at,
      resources(title),
      users(name, email)
    `)
    .in("status", ["pending", "ready"])
    .order("created_at", { ascending: true });

  const reservations = (data ?? []) as any[];

  const pendingReservations = reservations.filter(
    (r) => r.status === "pending"
  );

  const readyReservations = reservations.filter(
    (r) => r.status === "ready"
  );

  return (
    <div>
      <h1>Reservation Management</h1>

      {error && (
        <section className="panel">
          <p className="error">
            Unable to load reservations. Please try again.
          </p>
        </section>
      )}

      {!error && (
        <>
          <section className="panel">
            <h2>Ready for Pickup ({readyReservations.length})</h2>

            {readyReservations.length === 0 ? (
              <p className="muted">No reservations ready for pickup.</p>
            ) : (
              <ul className="list">
                {readyReservations.map((r) => (
                  <li key={r.id} className="reservation-row">
                    <div>
                      <strong>{r.resources?.title ?? "Resource"}</strong>

                      <div>
                        {r.users?.name ?? "Unknown student"}
                        <span className="muted small">
                          {" "}({r.users?.email ?? "No email"})
                        </span>
                      </div>

                      <div className="muted small">
                        Hold expires:{" "}
                        {r.expires_at
                          ? new Date(r.expires_at).toLocaleString("en-GB", {
                              timeZone: "Asia/Bangkok",
                            })
                          : "Unknown"}
                      </div>
                    </div>

                    <div>
                      <span className="badge badge-success">Ready</span>

                      <div style={{ marginTop: "0.5rem" }}>
                        <CompletePickupButton
                          reservationId={r.id}
                          studentId={r.user_id}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2>Pending Queue ({pendingReservations.length})</h2>

            {pendingReservations.length === 0 ? (
              <p className="muted">No pending reservations.</p>
            ) : (
              <ul className="list">
                {pendingReservations.map((r, index) => (
                  <li key={r.id} className="reservation-row">
                    <div>
                      <strong>
                        #{index + 1} · {r.resources?.title ?? "Resource"}
                      </strong>

                      <div>
                        {r.users?.name ?? "Unknown student"}
                        <span className="muted small">
                          {" "}({r.users?.email ?? "No email"})
                        </span>
                      </div>

                      <div className="muted small">
                        Reserved:{" "}
                        {new Date(r.created_at).toLocaleString("en-GB", {
                          timeZone: "Asia/Bangkok",
                        })}
                      </div>
                    </div>

                    <span className="badge badge-muted">Pending</span>
                  </li>
                ))}
              </ul>
            )}

            <p className="muted small">
              Pending reservations are promoted automatically in FIFO order
              when a copy becomes available.
            </p>
          </section>
        </>
      )}
    </div>
  );
}