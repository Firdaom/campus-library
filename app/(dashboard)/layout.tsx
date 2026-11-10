
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

// Shared shell for the Student Portal.
// requireDashboardUser() ensures only student accounts can access this layout.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The profile (name, eligibility_status) is already loaded and cached by
  // requireDashboardUser(), so no second `users` query is needed here.
  const { supabase, user, profile } = await requireDashboardUser();

  return (
    <div className="app-shell">
      <NotificationBell supabase={supabase} userId={user.id} />

      <aside className="sidebar">
        <div className="brand">Campus Library</div>

        <nav>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="nav-link"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="user-name">
              {profile?.name ?? user.email}
            </span>

            {profile?.eligibility_status === "ineligible" && (
              <span className="badge badge-danger">
                Not eligible to borrow
              </span>
            )}
          </div>

          <SignOutButton />
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}
