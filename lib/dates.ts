/**
 * Bangkok (Asia/Bangkok, UTC+7, no DST) has a fixed offset, so this is a
 * plain arithmetic shift rather than full IANA timezone handling — correct
 * for this app's one timezone, not a general-purpose utility.
 */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Returns the Asia/Bangkok calendar date for `date` as 'YYYY-MM-DD'. */
export function toBangkokDateString(date: Date): string {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's Asia/Bangkok calendar date as 'YYYY-MM-DD'. */
export function todayBangkok(): string {
  return toBangkokDateString(new Date());
}

/** Tomorrow's Asia/Bangkok calendar date as 'YYYY-MM-DD'. */
export function tomorrowBangkok(): string {
  const now = new Date();
  return toBangkokDateString(new Date(now.getTime() + 24 * 60 * 60 * 1000));
}
