import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { publishEvent } from "@/lib/services/notificationHub";
import { toBangkokDateString, todayBangkok, tomorrowBangkok } from "@/lib/dates";

/**
 * FR-09 — loan.due / loan.overdue, once daily at 09:00 Asia/Bangkok
 * (db/migrations/0001_pg_cron_jobs.sql schedules this at 02:00 UTC).
 *
 *   loan.due      1 day before due date   — once
 *   loan.due      on the due date         — once
 *   loan.overdue  day after due, daily    — until returned
 *
 * Duplicate prevention: notification_history has a unique index on
 * (loan_id, event_type, sent_on) (db/schema.sql). This route checks it
 * before calling the Notification Hub, AND only inserts a history row
 * after a confirmed successful delivery — so:
 *   - a loan already notified today is skipped before any network call
 *   - a failed delivery leaves no history row, so the NEXT run (or a
 *     manual re-trigger the same day) retries it, without a duplicate
 *     being recorded for a delivery that already succeeded
 *   - the unique index is the hard backstop if two runs ever overlap
 * loan.overdue stops automatically: the query below only looks at loans
 * where returned_at is null, so a returned loan simply stops matching.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const today = todayBangkok();
  const tomorrow = tomorrowBangkok();

  const { data: activeLoans, error } = await supabase
    .from("loans")
    .select("id, user_id, due_at")
    .is("returned_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let skippedAlreadySent = 0;
  let failed = 0;

  for (const loan of activeLoans ?? []) {
    const dueDate = toBangkokDateString(new Date(loan.due_at));

    let eventType: "loan.due" | "loan.overdue" | null = null;
    if (dueDate === tomorrow) eventType = "loan.due";
    else if (dueDate === today) eventType = "loan.due";
    else if (dueDate < today) eventType = "loan.overdue";

    if (!eventType) continue; // not due soon, not due today, not yet overdue

    // Check history BEFORE calling the Notification Hub, to avoid an
    // unnecessary network call for a loan already notified today.
    const { data: existing } = await supabase
      .from("notification_history")
      .select("id")
      .eq("loan_id", loan.id)
      .eq("event_type", eventType)
      .eq("sent_on", today)
      .maybeSingle();

    if (existing) {
      skippedAlreadySent++;
      continue;
    }

    const delivered = await publishEvent({
      type: eventType,
      loan_id: loan.id,
      user_id: loan.user_id,
      due_at: loan.due_at,
    });

    if (!delivered) {
      failed++;
      continue; // no history row written -> retried on the next run
    }

    const { error: historyError } = await supabase
      .from("notification_history")
      .insert({ loan_id: loan.id, event_type: eventType, sent_on: today });

    // 23505 = unique_violation: another concurrent run already recorded
    // this (loan_id, event_type, today) — the Notification Hub may have
    // received the event twice in that narrow race, which is an accepted
    // tradeoff of at-least-once delivery; the history table still only
    // ever shows one row, so no THIRD run would ever re-send it.
    if (historyError && (historyError as any).code !== "23505") {
      console.error("[loan-notifications] failed to record history:", historyError.message);
    }

    sent++;
  }

  return NextResponse.json({ sent, skipped_already_sent: skippedAlreadySent, failed });
}
