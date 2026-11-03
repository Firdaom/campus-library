/**
 * Notification Hub — fire-and-forget. FR-09 / section 13: failure here must
 * never block or roll back the loan/return/reservation transaction that
 * triggered it, so every call here is best-effort and swallows its own errors.
 */
type LibraryEvent =
  | { type: "loan.due"; loan_id: string; user_id: string; due_at: string }
  | { type: "loan.overdue"; loan_id: string; user_id: string; due_at: string }
  | { type: "reservation.ready"; reservation_id: string; user_id: string; resource_id: string; expires_at: string };

/**
 * Returns whether delivery succeeded. Fire-and-forget callers (loan return,
 * reservation expiry) can ignore the return value — those events have no
 * dedupe requirement. The daily loan-notifications cron DOES check it: it
 * only records a notification_history row after a true success, so a
 * failed delivery is naturally retried on the next run instead of being
 * marked as sent (see app/api/cron/loan-notifications/route.ts).
 */
export async function publishEvent(event: LibraryEvent): Promise<boolean> {
  const url = process.env.NOTIFICATION_HUB_URL;
  if (!url) {
    console.warn("[notification-hub] not configured, dropping event:", event.type);
    return false;
  }

  try {
    const res = await fetch(`${url}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NOTIFICATION_HUB_API_KEY}`,
      },
      body: JSON.stringify(event),
    });
    if (!res.ok) {
      console.error(`[notification-hub] publish failed (${res.status}) for ${event.type}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notification-hub] publish error:", err);
    return false;
  }
}
