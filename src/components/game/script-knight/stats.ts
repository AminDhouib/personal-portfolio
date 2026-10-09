import { z } from "zod";
import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";
import { ACTION_LOG_RE } from "./engine/codec";
import { storedVersionIsNewer } from "./stored-version";

// Local daily statistics. Their own key, never uploaded, display-only (DESIGN.md: forgeable, so
// nothing reads them to gate anything). Versioned like tower:stats; a newer build's record is
// left alone rather than downgraded. T7-6 adds a `ghost` field additively.
export const STATS_KEY = "knight:stats";

/** The handle last used on the board; the server sanitizes it to the same length. */
export const HANDLE_MAX = 12;
const COUNT_CAP = 999_999_999;

export type KnightStats = {
  v: 1;
  /** Best daily score and its UTC day. */
  bestDaily: { day: string; score: number } | null;
  /** Daily floors cleared (every clear counts, replays of the same day too). */
  runs: number;
  /** Last UTC day with a cleared daily floor, and the streak of consecutive such days. */
  lastDailyDay: string | null;
  streakDays: number;
  bestStreakDays: number;
  /** The handle last used on the board (sanitized on the server; capped at 12 here). */
  handle: string;
  /**
   * Your best log for one UTC day, replayed as a translucent knight in a new run that day. It
   * never affects a run, a score or a proof. `score` is the log's score, so a later run can be
   * compared with it.
   */
  ghost: { day: string; log: string; score: number } | null;
};

export const EMPTY_STATS: KnightStats = {
  v: 1,
  bestDaily: null,
  runs: 0,
  lastDailyDay: null,
  streakDays: 0,
  bestStreakDays: 0,
  handle: "",
  ghost: null,
};

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const count = z
  .number()
  .finite()
  .transform((n) => Math.min(COUNT_CAP, Math.max(0, Math.floor(n))))
  .catch(0);

const ghostSchema = z
  .object({
    day: z.string().regex(DAY_PATTERN),
    log: z.string().regex(ACTION_LOG_RE),
    score: z.number().finite().min(0).transform(Math.floor),
  })
  .nullable()
  .catch(null);

const statsSchema = z.object({
  v: z.literal(1),
  bestDaily: z
    .object({
      day: z.string().regex(DAY_PATTERN),
      score: z.number().finite().min(0).transform(Math.floor),
    })
    .nullable()
    .catch(null),
  runs: count,
  lastDailyDay: z.string().regex(DAY_PATTERN).nullable().catch(null),
  streakDays: count,
  bestStreakDays: count,
  handle: z
    .string()
    .transform((text) => text.slice(0, HANDLE_MAX))
    .catch(""),
  ghost: ghostSchema,
});

export function parseStats(raw: unknown): KnightStats {
  const result = statsSchema.safeParse(raw);
  if (!result.success) return structuredClone(EMPTY_STATS);
  const data = result.data;
  // The best streak can never be below the current one.
  return { ...data, bestStreakDays: Math.max(data.bestStreakDays, data.streakDays) };
}

export function loadStats(): KnightStats {
  let text: string | null;
  try {
    text = window.localStorage.getItem(STATS_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means empty statistics
    return structuredClone(EMPTY_STATS);
  }
  if (text === null) return structuredClone(EMPTY_STATS);
  return parseStats(safeJsonParse<unknown>(text, "knight:stats"));
}

export function saveStats(stats: KnightStats): void {
  // A newer build wrote this: leave it alone rather than downgrade it.
  if (storedVersionIsNewer(STATS_KEY)) return;
  safeLocalSet(STATS_KEY, JSON.stringify(stats));
}

/** The UTC day before `dayKey` ("2026-10-16" -> "2026-10-15"). */
function previousDay(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  return new Date(date.getTime() - 86_400_000).toISOString().slice(0, 10);
}

export type DailyClear = {
  score: number;
  /** The action log of the clear; kept as the ghost when it is the day's best. */
  log?: string;
  /** The UTC day the floor was cleared on, "YYYY-MM-DD". */
  day: string;
};

/**
 * Folds one cleared daily floor in. Every clear counts; the best rises only on a strictly higher
 * score. A repeat of the same day keeps the streak, the next UTC day extends it, and a gap, or a
 * last day ahead of the run, restarts it at one.
 */
export function recordDaily(stats: KnightStats, clear: DailyClear): KnightStats {
  const next = structuredClone(stats);
  const score = Math.max(0, Math.floor(clear.score));
  next.runs = Math.min(COUNT_CAP, next.runs + 1);
  if (next.bestDaily === null || score > next.bestDaily.score) {
    next.bestDaily = { day: clear.day, score };
  }
  if (clear.log !== undefined && ACTION_LOG_RE.test(clear.log)) {
    const held = next.ghost;
    if (held === null || held.day !== clear.day || score > held.score) {
      next.ghost = { day: clear.day, log: clear.log, score };
    }
  }
  const last = next.lastDailyDay;
  if (last === clear.day) return next;
  // A last day ahead of this run means the clock was wrong once; restart on the run's day
  // rather than freeze the streak until real time catches up (the same call as Tower Stacker).
  next.streakDays = last === previousDay(clear.day) ? Math.min(COUNT_CAP, next.streakDays + 1) : 1;
  next.bestStreakDays = Math.max(next.bestStreakDays, next.streakDays);
  next.lastDailyDay = clear.day;
  return next;
}

/** The streak as it stands today: it lapses once a whole UTC day passes with no clear. */
export function activeStreak(stats: KnightStats, today: string): number {
  const { lastDailyDay, streakDays } = stats;
  return lastDailyDay === today || lastDailyDay === previousDay(today) ? streakDays : 0;
}

/** Remembers the handle last used on the board; returns the same object when unchanged. */
export function setHandle(stats: KnightStats, handle: string): KnightStats {
  const next = handle.slice(0, HANDLE_MAX);
  return stats.handle === next ? stats : { ...stats, handle: next };
}

/** The ghost's log for `day`, or null: a ghost belongs to the day it was set. */
export function ghostFor(stats: KnightStats, day: string): string | null {
  return stats.ghost?.day === day ? stats.ghost.log : null;
}
