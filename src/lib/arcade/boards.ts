/**
 * Arcade board keys. Pure and isomorphic (no imports), so the server store and a
 * future client can share it. Every board key is computed on the SERVER from its
 * own clock; a client never names one.
 *
 * Keys: "all-time", "daily:YYYY-MM-DD" (UTC calendar day) and "weekly:YYYY-Www"
 * (ISO-8601 week in UTC: weeks start Monday, week 01 holds the year's first
 * Thursday, and the week-year can differ from the calendar year, so 2027-01-01 is
 * 2026-W53). All numbers are zero padded, which makes a plain string comparison
 * chronological within one prefix. The store's retention delete relies on that
 * (with COLLATE "C" so the comparison is locale independent).
 *
 * Convention for later tracks (DESIGN.md "Arcade backend"): a daily seeded
 * challenge must seed from `utcDayKey` so the seed and the daily board agree.
 */

export type BoardPeriod = "all-time" | "weekly" | "daily";

/** The order the submit response lists the boards in. */
export const BOARD_PERIODS = [
  "all-time",
  "weekly",
  "daily",
] as const satisfies readonly BoardPeriod[];

const DAILY_RETENTION_DAYS = 30;
const WEEKLY_RETENTION_WEEKS = 12;
const DAY_MS = 86_400_000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** The UTC calendar day of `date`, e.g. "2026-10-06". */
export function utcDayKey(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  return `${year}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** The ISO-8601 week of `date` in UTC, e.g. "2026-W41". */
export function isoWeekKey(date: Date): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Shift to the Thursday of this ISO week (Monday = 1 ... Sunday = 7); its year is the week-year.
  const isoDay = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
  day.setUTCDate(day.getUTCDate() + 4 - isoDay);
  const weekYear = day.getUTCFullYear();
  const dayOfYear = (day.getTime() - Date.UTC(weekYear, 0, 1)) / DAY_MS + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${String(weekYear).padStart(4, "0")}-W${pad2(week)}`;
}

/** The board key for `period` at the instant `date`. */
export function boardKey(period: BoardPeriod, date: Date): string {
  switch (period) {
    case "all-time":
      return "all-time";
    case "weekly":
      return `weekly:${isoWeekKey(date)}`;
    case "daily":
      return `daily:${utcDayKey(date)}`;
  }
}

/**
 * Boards strictly older than these keys are deleted for a game inside each submit
 * transaction: daily boards older than 30 days, weekly boards older than 12 weeks.
 */
export function retentionCutoffs(now: Date): { daily: string; weekly: string } {
  return {
    daily: boardKey("daily", new Date(now.getTime() - DAILY_RETENTION_DAYS * DAY_MS)),
    weekly: boardKey("weekly", new Date(now.getTime() - WEEKLY_RETENTION_WEEKS * 7 * DAY_MS)),
  };
}
