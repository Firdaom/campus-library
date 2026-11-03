import { requireDashboardUser } from "@/lib/currentUser";

// Profile: student account information and eligibility verification status
// (Student Dashboard spec). eligibility_status is the cache written by
// app/auth/callback at sign-in and refreshed at borrow time
// (lib/eligibility.ts) — displayed here read-only, never edited by the user.
export default async function ProfilePage() {
  const { supabase, user } = await requireDashboardUser();

  const { data: profile, error } = await supabase
    .from("users")
    .select("name, email, role, status, eligibility_status, eligibility_checked_at, created_at")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return <p className="error">Could not load your profile.</p>;
  }

  return (
    <div>
      <h1>Profile</h1>

      <section className="panel">
        <h2>Account</h2>
        <dl className="definition-list">
          <dt>Name</dt>
          <dd>{profile.name}</dd>
          <dt>Email</dt>
          <dd>{profile.email}</dd>
          <dt>Role</dt>
          <dd className="capitalize">{profile.role}</dd>
          <dt>Account status</dt>
          <dd className="capitalize">{profile.status}</dd>
          <dt>Member since</dt>
          <dd>{new Date(profile.created_at).toLocaleDateString()}</dd>
        </dl>
      </section>

      <section className="panel">
        <h2>Borrowing eligibility</h2>
        <p>
          <span className={`badge ${eligibilityBadgeClass(profile.eligibility_status)}`}>
            {eligibilityLabel(profile.eligibility_status)}
          </span>
        </p>
        <p className="muted small">
          {profile.eligibility_checked_at
            ? `Last verified with Student Identity on ${new Date(profile.eligibility_checked_at).toLocaleString()}.`
            : "Not verified yet — this runs automatically the next time you sign in or try to borrow a book."}
        </p>
        {profile.eligibility_status === "ineligible" && (
          <p className="error small">
            You&apos;re currently not eligible to borrow. Contact the library desk if you believe this is a
            mistake.
          </p>
        )}
      </section>
    </div>
  );
}

function eligibilityLabel(status: string) {
  if (status === "eligible") return "Eligible to borrow";
  if (status === "ineligible") return "Not eligible";
  return "Not yet verified";
}

function eligibilityBadgeClass(status: string) {
  if (status === "eligible") return "badge-success";
  if (status === "ineligible") return "badge-danger";
  return "badge-muted";
}
