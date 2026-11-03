
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * FR-12 / BR-05 / AC-09:
 * Expire ready reservations after 48 hours and promote the next
 * FIFO reservation atomically.
 *
 * Triggered every 5 minutes by Supabase Cron.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");

  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  // Find reservations whose 48-hour hold has expired.
  const { data: stale, error } = await supabase
    .from("reservations")
    .select("id")
    .eq("status", "ready")
    .lte("expires_at", nowIso);

  if (error) {
    console.error("Failed to find expired reservations:", error);

    return NextResponse.json(
      { error: "Unable to find expired reservations." },
      { status: 500 }
    );
  }

  let expiredCount = 0;
  let skippedCount = 0;

  for (const reservation of stale ?? []) {
    const { error: expireError } = await supabase.rpc(
      "expire_reservation_atomic",
      {
        p_reservation_id: reservation.id,
      }
    );

    if (expireError) {
      // Another cron run may already have processed this reservation.
      if (
        expireError.message?.includes("RESERVATION_NOT_READY") ||
        expireError.message?.includes("RESERVATION_NOT_EXPIRED_OR_ALREADY_PROCESSED")
      ) {
        skippedCount++;
        continue;
      }

      console.error(
        `Failed to expire reservation ${reservation.id}:`,
        expireError
      );

      skippedCount++;
      continue;
    }

    expiredCount++;
  }

  return NextResponse.json({
    expired_count: expiredCount,
    skipped_count: skippedCount,
  });
}
