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

  // Only loans that can possibly need an event: due on/before tomorrow's
  // Bangkok calendar day (that covers overdue, due today and due tomorrow).
  // Anything due later is skipped by the loop below anyway, so filter it out
  // in the database instead of loading every active loan.
  // Bangkok is a fixed UTC+7, so the end of tomorrow (Bangkok) is
  // 00:00 Bangkok of the day after tomorrow = (that date) 00:00 +07:00.
  const dayAfterTomorrow = toBangkokDateString(
    new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  );
  const dueCutoff = new Date(`${dayAfterTomorrow}T00:00:00+07:00`).toISOString();

  const [{ data: activeLoans, error }, { data: historyToday }] = await Promise.all([
    supabase
      .from("loans")
      .select("id, user_id, due_at")
      .is("returned_at", null)
      .lt("due_at", dueCutoff),
    // One query for today's history rows instead of one lookup per loan.
    supabase
      .from("notification_history")
      .select("loan_id, event_type")
      .eq("sent_on", today),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const alreadySent = new Set(
    (historyToday ?? []).map((h) => `${h.loan_id}:${h.event_type}`)
  );

  let sent = 0;
  let skippedAlreadySent = 0;
  let failed = 0;

  // Work out what each loan needs, then deliver in small concurrent batches
  // (the Notification Hub calls dominate the run time when done one by one).
  const pending: {
    loan: { id: string; user_id: string; due_at: string };
    eventType: "loan.due" | "loan.overdue";
  }[] = [];

  for (const loan of activeLoans ?? []) {
    const dueDate = toBangkokDateString(new Date(loan.due_at));

    let eventType: "loan.due" | "loan.overdue" | null = null;
    if (dueDate === tomorrow) eventType = "loan.due";
    else if (dueDate === today) eventType = "loan.due";
    else if (dueDate < today) eventType = "loan.overdue";

    if (!eventType) continue; // not due soon, not due today, not yet overdue

    // Skip loans already notified today before making any network call.
    if (alreadySent.has(`${loan.id}:${eventType}`)) {
      skippedAlreadySent++;
      continue;
    }

    pending.push({ loan, eventType });
  }

  const CONCURRENCY = 10;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async ({ loan, eventType }) => {
        const delivered = await publishEvent({
          type: eventType,
          loan_id: loan.id,
          user_id: loan.user_id,
          due_at: loan.due_at,
        });

        if (!delivered) {
          failed++;
          return; // no history row written -> retried on the next run
        }

        const { error: historyError } = await supabase
          .from("notification_history")
          .insert({ loan_id: loan.id, event_type: eventType, sent_on: today });

        // 23505 = unique_violation: another concurrent run already recorded
        // this (loan_id, event_type, today) — the Notification Hub may have
        // received the event twice in that narrow race, which is an accepted
        // tradeoff of at-least-once delivery; the history table still only
        // ever shows one row, so no THIRD run would ever re-send it.
        if (historyError && historyError.code !== "23505") {
          console.error("[loan-notifications] failed to record history:", historyError.message);
        }

        sent++;
      })
    );
  }

  return NextResponse.json({ sent, skipped_already_sent: skippedAlreadySent, failed });
}
