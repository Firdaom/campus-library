import Link from "next/link";
import { requireDashboardUser } from "@/lib/currentUser";
import { SignOutButton } from "@/components/SignOutButton";
import { NotificationBell } from "@/components/NotificationBell";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/browse", label: "Browse Books" },
  { href: "/loans", label: "My Loans" },
  { href: "/reservations", label: "My Reservations" },
  { href: "/profile", label: "Profile" },
];

// Shared shell for the Student Dashboard (spec: "Student Dashboard – Pages
// and Features"). requireDashboardUser() redirects to "/" if there's no
// session, so everything rendered below this point can assume a signed-in
// user. Not role-gated to students only — a staff/admin account that also
// borrows books sees the same personal view, scoped to their own rows by
// RLS (db/schema.sql) regardless of role.
//
// Notifications is NOT in NAV_ITEMS — it's the corner bell (NotificationBell)
// instead, present on every page under this layout.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireDashboardUser();

  const { data: profile } = await supabase
    .from("users")
    .select("name, role, eligibility_status")
    .eq("id", user.id)
    .single();

  const isStaff = profile?.role === "staff" || profile?.role === "admin";

  return (
    <div className="app-shell">
      <NotificationBell supabase={supabase} userId={user.id} />
      <aside className="sidebar">
        <div className="brand">Campus Library</div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              {item.label}
            </Link>
          ))}
          {isStaff && (
            <Link href="/circulation" className="nav-link nav-link-staff">
              Staff tools →
            </Link>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="user-name">{profile?.name ?? user.email}</span>
            {profile?.eligibility_status === "ineligible" && (
              <span className="badge badge-danger">Not eligible to borrow</span>
            )}
          </div>
          <SignOutButton />
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
