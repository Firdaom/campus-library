import { requireDashboardUser } from "@/lib/currentUser";
import { getNotificationItems } from "@/lib/notifications";

// Notifications: in-app feed of loan/reservation alerts (FR-13-adjacent —
// "notifications related to book loans and reservations"). Reached via the
// bell icon fixed in the corner of every page (components/NotificationBell.tsx)
// rather than a sidebar nav entry. The actual email/push delivery for the
// same events goes through the Notification Hub (FR-09) via the daily
// app/api/cron/loan-notifications job and app/api/cron/expire-reservations
// — this page is the student-facing mirror of that, not a duplicate of
// notification_history.
export default async function NotificationsPage() {
  const { supabase, user } = await requireDashboardUser();
  const items = await getNotificationItems(supabase, user.id);

  return (
    <div>
      <h1>Notifications</h1>

      {items.length === 0 ? (
        <p className="muted">You&apos;re all caught up — no loan or reservation alerts right now.</p>
      ) : (
        <ul className="list">
          {items.map((item) => (
            <li key={item.id} className={`notification notification-${item.tone}`}>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
