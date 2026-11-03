import { redirect } from "next/navigation";
import { requireStaffUser } from "@/lib/currentUser";
import { RoleChangeControl } from "./RoleChangeControl";

// Admin — Users: view all user accounts, change a user's role (FR-11,
// AC-08). requireStaffUser() already requires staff-or-admin; this page
// narrows further to admin-only and sends a staff caller back to the
// Circulation Desk rather than rendering a 403 page.
export default async function AdminUsersPage() {
  const { supabase, profile } = await requireStaffUser();

  if (profile.role !== "admin") {
    redirect("/circulation");
  }

  const { data: users, error } = await supabase
    .from("users")
    .select("id, name, email, role, status, eligibility_status")
    .order("name");

  return (
    <div>
      <h1>Admin — Users</h1>

      {error && <p className="error">{error.message}</p>}

      {!users || users.length === 0 ? (
        <p className="muted">No users found.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Account status</th>
              <th>Eligibility</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <span className={`badge ${u.status === "active" ? "badge-success" : "badge-danger"}`}>
                    {u.status}
                  </span>
                </td>
                <td>
                  <span className={`badge ${eligibilityBadgeClass(u.eligibility_status)}`}>
                    {u.eligibility_status}
                  </span>
                </td>
                <td>
                  {u.id === profile.id ? (
                    <span className="muted small">You can&apos;t change your own role here.</span>
                  ) : (
                    <RoleChangeControl userId={u.id} currentRole={u.role} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function eligibilityBadgeClass(status: string) {
  if (status === "eligible") return "badge-success";
  if (status === "ineligible") return "badge-danger";
  return "badge-muted";
}
