import Link from "next/link";
import { requireStaffUser } from "@/lib/currentUser";
import { toBangkokDateString } from "@/lib/dates";
import { CheckoutButton } from "./CheckoutButton";
import { ReturnButton } from "./ReturnButton";
import { CompletePickupButton } from "./CompletePickupButton";

// Circulation Desk: check out (create loan), check in (return), and
// complete pickup for a student's ready reservation (FR-03, FR-04, FR-05,
// AC-02, AC-03). A two-step, server-rendered flow driven entirely by
// searchParams (plain GET forms, no client state needed for the search
// itself): find a student, then find a book, then check out one of its
// available copies. Only the final actions (checkout/return) are Client
// Components, since those are the only steps that need to call a mutating
// API route.
export default async function CirculationDeskPage(
  props: {
    searchParams: Promise<{ studentQuery?: string; studentId?: string; bookQuery?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const { supabase } = await requireStaffUser();

  // Defensive length clamp, same spirit as GET /resources' 200-char limit —
  // these values only ever feed an `ilike` pattern, never raw SQL.
  const studentQuery = searchParams.studentQuery?.trim().slice(0, 200);
  const studentId = searchParams.studentId;
  const bookQuery = searchParams.bookQuery?.trim().slice(0, 200);

  let selectedStudent: { id: string; name: string; email: string; eligibility_status: string } | null = null;
  if (studentId) {
    const { data } = await supabase
      .from("users")
      .select("id, name, email, eligibility_status")
      .eq("id", studentId)
      .single();
    selectedStudent = data ?? null;
  }

  let studentResults: { id: string; name: string; email: string }[] = [];
  if (!selectedStudent && studentQuery) {
    // Two separate `ilike` queries merged in JS rather than one `.or(...)`
    // filter string — avoids building a PostgREST filter expression out of
    // raw user input (commas/parens in a name would otherwise need manual
    // escaping to stay inside one `.or()` string).
    const [{ data: byName }, { data: byEmail }] = await Promise.all([
      supabase.from("users").select("id, name, email").eq("role", "student").ilike("name", `%${studentQuery}%`).limit(10),
      supabase.from("users").select("id, name, email").eq("role", "student").ilike("email", `%${studentQuery}%`).limit(10),
    ]);
    const seen = new Set<string>();
    studentResults = [...(byName ?? []), ...(byEmail ?? [])]
      .filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)))
      .slice(0, 10);
  }

  // FR-05: reservations held and ready for this student to collect.
  let readyReservations: { id: string; resources: { title: string } | null; expires_at: string | null }[] = [];
  if (selectedStudent) {
    const { data } = await supabase
      .from("reservations")
      .select("id, expires_at, resources(title)")
      .eq("user_id", selectedStudent.id)
      .eq("status", "ready")
      .order("expires_at", { ascending: true });
    readyReservations = (data ?? []) as any;
  }

  let bookResults: { id: string; title: string; author: string | null; category: string; copies: { id: string; status: string }[] }[] = [];
  if (selectedStudent && bookQuery) {
    const { data } = await supabase
      .from("resources")
      .select("id, title, author, category, copies(id, status)")
      .ilike("title", `%${bookQuery}%`)
      .limit(10);
    bookResults = (data ?? []) as any;
  }

  const { data: activeLoans } = await supabase
    .from("loans")
    .select("id, due_at, copies(resources(title)), users(name, email)")
    .is("returned_at", null)
    .order("due_at", { ascending: true });

  const today = toBangkokDateString(new Date());

  return (
    <div>
      <h1>Circulation Desk</h1>

      <section className="panel">
        <h2>Check out a book</h2>

        {!selectedStudent ? (
          <>
            <form action="/circulation" method="GET" className="search-box">
              <input
                type="text"
                name="studentQuery"
                placeholder="Find a student by name or email"
                defaultValue={studentQuery}
                aria-label="Search students"
              />
              <button type="submit" className="btn btn-primary">
                Search
              </button>
            </form>

            {studentQuery &&
              (studentResults.length === 0 ? (
                <p className="muted">No students match &quot;{studentQuery}&quot;.</p>
              ) : (
                <ul className="list">
                  {studentResults.map((s) => (
                    <li key={s.id}>
                      <span>
                        {s.name} <span className="muted small">({s.email})</span>
                      </span>
                      <Link href={`/circulation?studentId=${s.id}`} className="btn btn-ghost btn-sm">
                        Select
                      </Link>
                    </li>
                  ))}
                </ul>
              ))}
          </>
        ) : (
          <>
            <div className="selected-row">
              <div>
                <strong>{selectedStudent.name}</strong>
                <span className="muted small"> · {selectedStudent.email}</span>
                {selectedStudent.eligibility_status !== "eligible" && (
                  <span
                    className={`badge ${
                      selectedStudent.eligibility_status === "ineligible" ? "badge-danger" : "badge-muted"
                    }`}
                    style={{ marginLeft: "0.5rem" }}
                  >
                    {selectedStudent.eligibility_status === "ineligible" ? "Not eligible" : "Not yet verified"}
                  </span>
                )}
              </div>
              <Link href="/circulation" className="link">
                Change student
              </Link>
            </div>

            {/* BR-03 is still enforced server-side in POST /api/loans — this
                banner just saves staff a failed attempt for a student who's
                visibly not eligible. */}
            {selectedStudent.eligibility_status === "ineligible" && (
              <p className="error small">
                This student is not currently eligible to borrow. Checkout will be rejected.
              </p>
            )}

            {readyReservations.length > 0 && (
              <div style={{ marginTop: "0.9rem" }}>
                <h3 style={{ margin: "0 0 0.4rem" }}>Ready for pickup</h3>
                <ul className="list">
                  {readyReservations.map((r) => (
                    <li key={r.id} className="reservation-row">
                      <div>
                        <strong>{r.resources?.title ?? "Resource"}</strong>
                        <div className="muted small">
                          Hold expires {r.expires_at ? new Date(r.expires_at).toLocaleString() : "soon"}
                        </div>
                      </div>
                      <CompletePickupButton reservationId={r.id} studentId={selectedStudent.id} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form action="/circulation" method="GET" className="search-box" style={{ marginTop: "0.9rem" }}>
              <input type="hidden" name="studentId" value={selectedStudent.id} />
              <input
                type="text"
                name="bookQuery"
                placeholder="Find a book by title"
                defaultValue={bookQuery}
                aria-label="Search books"
              />
              <button type="submit" className="btn btn-primary">
                Search
              </button>
            </form>

            {bookQuery &&
              (bookResults.length === 0 ? (
                <p className="muted">No books match &quot;{bookQuery}&quot;.</p>
              ) : (
                <ul className="list">
                  {bookResults.map((r) => {
                    const available = r.copies.filter((c) => c.status === "available");
                    return (
                      <li key={r.id} className="reservation-row">
                        <div>
                          <strong>{r.title}</strong>
                          <div className="muted small">
                            {r.category}
                            {r.author ? ` · ${r.author}` : ""}
                          </div>
                        </div>
                        {available.length > 0 ? (
                          <CheckoutButton
                            copyId={available[0].id}
                            studentId={selectedStudent.id}
                            label={`Check out (${available.length} available)`}
                          />
                        ) : (
                          <span className="badge badge-muted">No copies available</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ))}
          </>
        )}
      </section>

      <section className="panel">
        <h2>Active loans</h2>
        {!activeLoans || activeLoans.length === 0 ? (
          <p className="muted">No active loans.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Borrower</th>
                <th>Due</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(activeLoans as any[]).map((loan) => {
                const isOverdue = toBangkokDateString(new Date(loan.due_at)) < today;
                return (
                  <tr key={loan.id}>
                    <td>{loan.copies?.resources?.title ?? "—"}</td>
                    <td>
                      {loan.users?.name ?? "—"}
                      <div className="muted small">{loan.users?.email}</div>
                    </td>
                    <td>{new Date(loan.due_at).toLocaleDateString()}</td>
                    <td>
                      {isOverdue ? (
                        <span className="badge badge-danger">Overdue</span>
                      ) : (
                        <span className="badge badge-success">Active</span>
                      )}
                    </td>
                    <td>
                      <ReturnButton loanId={loan.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
