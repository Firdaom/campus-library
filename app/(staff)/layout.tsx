
import Link from "next/link";
import { requireStaffUser } from "@/lib/currentUser";
import { SignOutButton } from "@/components/SignOutButton";
import { NotificationBell } from "@/components/NotificationBell";

// Shared shell for Staff/Admin screens.
// requireStaffUser() ensures only staff/admin accounts can access this layout.
export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user, profile } = await requireStaffUser();

  const navItems = [
  { href: "/circulation", label: "Circulation Desk" },
  { href: "/staff/reservations", label: "Reservation Management" },
  ...(profile.role === "admin"
    ? [{ href: "/admin/users", label: "Admin — Users" }]
    : []),
];

  return (
    <div className="app-shell">
      <NotificationBell supabase={supabase} userId={user.id} />

      <aside className="sidebar">
        <div className="brand">Campus Library</div>

        <nav>
          {navItems.map((item) => (
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
            <span className="user-name">{profile.name}</span>
            <span className="badge badge-info capitalize">
              {profile.role}
            </span>
          </div>

          <SignOutButton />
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}
