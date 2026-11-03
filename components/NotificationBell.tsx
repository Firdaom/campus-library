import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getNotificationItems } from "@/lib/notifications";

// Fixed to the top-right corner of the viewport (see .notif-bell in
// globals.css) and rendered once per layout (app/(dashboard)/layout.tsx,
// app/(staff)/layout.tsx) so it's present on every page, not just its own
// route — replaces the old "Notifications" sidebar link. No client-side
// state needed: it's just a link + a count, so this stays a Server
// Component like the rest of the data-fetching in this app.
export async function NotificationBell({ supabase, userId }: { supabase: SupabaseClient; userId: string }) {
  const items = await getNotificationItems(supabase, userId);
  const count = items.length;
  const hasOverdue = items.some((item) => item.tone === "danger");

  return (
    <Link
      href="/notifications"
      className="notif-bell"
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
    >
      <BellIcon />
      {count > 0 && (
        <span className={`notif-badge${hasOverdue ? " notif-badge-danger" : ""}`}>{count > 9 ? "9+" : count}</span>
      )}
    </Link>
  );
}

function BellIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
