import Link from "next/link";
import { requireStaffUser } from "@/lib/currentUser";
import { SignOutButton } from "@/components/SignOutButton";
import { NotificationBell } from "@/components/NotificationBell";

// Shared shell for the Staff/Admin screens (spec section 9 Frontend table:
// Circulation Desk (Staff) — FR-03/FR-04, Admin — Users (Admin) — FR-11).
// requireStaffUser() redirects anyone who isn't staff/admin back to
// /dashboard, so everything below can assume the caller has one of those
// roles; "Admin — Users" additionally redirects staff (non-admin) itself,
// since role here is still "staff" for that case.
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profile } = await requireStaffUser();

  const navItems = [
    { href: "/circulation", label: "Circulation Desk" },
    ...(profile.role === "admin" ? [{ href: "/admin/users", label: "Admin — Users" }] : []),
  ];

  return (
    <div className="app-shell">
      {/* Staff/admin accounts can borrow too, so they get the same
          loan/reservation bell as the Student Dashboard. */}
      <NotificationBell supabase={supabase} userId={user.id} />
      <aside className="sidebar">
        <div className="brand">Campus Library</div>
        <nav>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              {item.label}
            </Link>
          ))}
          <Link href="/dashboard" className="nav-link nav-link-staff">
            ← Student dashboard
          </Link>
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="user-name">{profile.name}</span>
            <span className="badge badge-info capitalize">{profile.role}</span>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
