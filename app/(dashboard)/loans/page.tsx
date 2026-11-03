import { requireDashboardUser } from "@/lib/currentUser";
import { toBangkokDateString } from "@/lib/dates";

// My Loans: borrowed books, borrowing dates, and due dates (FR-07).
export default async function LoansPage() {
  const { supabase, user } = await requireDashboardUser();

  const { data: loans, error } = await supabase
    .from("loans")
    .select("id, borrowed_at, due_at, returned_at, copies(resources(title, author))")
    .eq("user_id", user.id)
    .order("borrowed_at", { ascending: false });

  const today = toBangkokDateString(new Date());

  return (
    <div>
      <h1>My Loans</h1>

      {error && <p className="error">{error.message}</p>}

      {!loans || loans.length === 0 ? (
        <p className="muted">You haven&apos;t borrowed anything yet — find something on the Browse Books page.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Borrowed</th>
              <th>Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(loans as any[]).map((loan) => {
              const isOverdue = !loan.returned_at && toBangkokDateString(new Date(loan.due_at)) < today;
              return (
                <tr key={loan.id}>
                  <td>
                    {loan.copies?.resources?.title ?? "—"}
                    {loan.copies?.resources?.author && (
                      <div className="muted small">{loan.copies.resources.author}</div>
                    )}
                  </td>
                  <td>{new Date(loan.borrowed_at).toLocaleDateString()}</td>
                  <td>{new Date(loan.due_at).toLocaleDateString()}</td>
                  <td>
                    {loan.returned_at ? (
                      <span className="badge badge-muted">Returned</span>
                    ) : isOverdue ? (
                      <span className="badge badge-danger">Overdue</span>
                    ) : (
                      <span className="badge badge-success">Active</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
