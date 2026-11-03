import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toBangkokDateString } from "@/lib/dates";

export type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  tone: "danger" | "warning" | "success";
};

/**
 * Derives the in-app notification feed live from the signed-in user's own
 * loans/reservations — no separate inbox table (see
 * app/(dashboard)/notifications/page.tsx for the full rationale). Shared by
 * that page and components/NotificationBell.tsx (the corner icon shown on
 * every page) so there's exactly one place computing "what counts as a
 * notification," and both call sites agree on the count.
 *
 * Wrapped in React's `cache()`, keyed on (supabase, userId): the bell in a
 * layout and the Notifications page itself both call this for the same
 * request, and since both get their `supabase` from the same cached
 * requireDashboardUser()/requireStaffUser() call, this collapses to one
 * query pair per request instead of two.
 */
export const getNotificationItems = cache(
  async (supabase: SupabaseClient, userId: string): Promise<NotificationItem[]> => {
    const [{ data: activeLoans }, { data: readyReservations }] = await Promise.all([
      supabase
        .from("loans")
        .select("id, due_at, copies(resources(title))")
        .eq("user_id", userId)
        .is("returned_at", null),
      supabase
        .from("reservations")
        .select("id, expires_at, resources(title)")
        .eq("user_id", userId)
        .eq("status", "ready"),
    ]);

    const today = toBangkokDateString(new Date());
    const tomorrow = toBangkokDateString(new Date(Date.now() + 24 * 60 * 60 * 1000));

    const items: NotificationItem[] = [];

    for (const loan of (activeLoans ?? []) as any[]) {
      const dueDate = toBangkokDateString(new Date(loan.due_at));
      const title = loan.copies?.resources?.title ?? "A book";

      if (dueDate < today) {
        items.push({
          id: `overdue-${loan.id}`,
          title,
          detail: `Overdue since ${new Date(loan.due_at).toLocaleDateString()} — please return it as soon as possible.`,
          tone: "danger",
        });
      } else if (dueDate === today) {
        items.push({ id: `due-today-${loan.id}`, title, detail: "Due today.", tone: "warning" });
      } else if (dueDate === tomorrow) {
        items.push({ id: `due-tomorrow-${loan.id}`, title, detail: "Due tomorrow.", tone: "warning" });
      }
    }

    for (const r of (readyReservations ?? []) as any[]) {
      items.push({
        id: `ready-${r.id}`,
        title: r.resources?.title ?? "A reservation",
        detail: `Ready for pickup — hold expires ${r.expires_at ? new Date(r.expires_at).toLocaleString() : "soon"}.`,
        tone: "success",
      });
    }

    return items;
  }
);
