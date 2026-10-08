import { z } from "zod";
import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";

// Per-device retention stats. Their own key, never uploaded, display-only
// (forgeable, so nothing reads them to gate anything). A streak day is a UTC day
// with a completed DAILY run: the daily seed is UTC, so a streak day is a seed day.
export const STATS_KEY = "pg2:stats";

const HISTORY_MAX = 14;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const dayText = z.string().regex(DAY_RE);
const ms = z.number().finite().nonnegative();

const statsSchema = z.object({
  v: z.literal(1),
  runs: z.number().int().nonnegative(),
  bestMs: ms.nullable(),
  dailyBestMs: ms.nullable(),
  streak: z.number().int().nonnegative(),
  bestStreak: z.number().int().nonnegative(),
  lastDailyDay: dayText.nullable(),
  history: z.array(z.object({ day: dayText, ms, seed: z.number() })).max(HISTORY_MAX),
});

export type Pg2Stats = z.infer<typeof statsSchema>;

export type RunRecord = { ms: number; daily: boolean; day: string; seed: number };

export function emptyStats(): Pg2Stats {
  return {
    v: 1,
    runs: 0,
    bestMs: null,
    dailyBestMs: null,
    streak: 0,
    bestStreak: 0,
    lastDailyDay: null,
    history: [],
  };
}

export function loadStats(): Pg2Stats {
  let text: string | null;
  try {
    text = window.localStorage.getItem(STATS_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means empty stats
    return emptyStats();
  }
  if (text === null) return emptyStats();
  const result = statsSchema.safeParse(safeJsonParse<unknown>(text, "pg2:stats"));
  return result.success ? result.data : emptyStats();
}

/**
 * True when the stored value is an object whose `v` is above this code's version: a
 * newer build wrote it (a rollback, an old tab). Saving over it would destroy it.
 */
function storedIsNewer(): boolean {
  let text: string | null;
  try {
    text = window.localStorage.getItem(STATS_KEY);
  } catch {
    // silent-ok: blocked storage cannot hold a newer value, and the save will fail on its own
    return false;
  }
  if (text === null) return false;
  const value = safeJsonParse<unknown>(text, "pg2:stats");
  if (typeof value !== "object" || value === null) return false;
  const v = (value as { v?: unknown }).v;
  return typeof v === "number" && v > 1;
}

export function saveStats(stats: Pg2Stats): void {
  if (storedIsNewer()) return;
  safeLocalSet(STATS_KEY, JSON.stringify(stats));
}

/** Whole days from `a` to `b` ("YYYY-MM-DD"); pure calendar arithmetic, TZ independent. */
function dayDiff(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number) as [number, number, number];
  const [yb, mb, db] = b.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** Folds one finished run in. Pure: returns a new object. */
export function recordRun(prev: Pg2Stats, run: RunRecord): Pg2Stats {
  const next: Pg2Stats = {
    ...prev,
    runs: prev.runs + 1,
    bestMs: prev.bestMs === null ? run.ms : Math.min(prev.bestMs, run.ms),
    history: prev.history,
  };
  if (!run.daily) return next;

  next.dailyBestMs = prev.dailyBestMs === null ? run.ms : Math.min(prev.dailyBestMs, run.ms);
  const gap = prev.lastDailyDay === null ? null : dayDiff(prev.lastDailyDay, run.day);
  if (gap === null) next.streak = 1;
  else if (gap === 1) next.streak = prev.streak + 1;
  else if (gap > 1) next.streak = 1;
  // gap <= 0: a repeat of the same day (or a clock stepping back) keeps the streak.
  next.bestStreak = Math.max(prev.bestStreak, next.streak);
  if (gap === null || gap > 0) next.lastDailyDay = run.day;

  const entry = { day: run.day, ms: run.ms, seed: run.seed };
  const existing = prev.history.findIndex((h) => h.day === run.day);
  if (existing >= 0) {
    const history = [...prev.history];
    if (run.ms < history[existing]!.ms) history[existing] = entry;
    next.history = history;
  } else {
    next.history = [...prev.history, entry].slice(-HISTORY_MAX);
  }
  return next;
}

/**
 * The streak to show on `todayUtc`: live while the last daily was today or yesterday
 * (today's run is still to come), zero once a whole day has been missed.
 */
export function streakAsOf(stats: Pg2Stats, todayUtc: string): number {
  if (stats.lastDailyDay === null) return 0;
  return dayDiff(stats.lastDailyDay, todayUtc) <= 1 ? stats.streak : 0;
}

/** Whole minutes and seconds, "mm:ss". */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
