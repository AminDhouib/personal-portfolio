import { z } from "zod";
import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";
import { storedVersionIsNewer } from "./stored-version";

// Local statistics. Their own key, never uploaded, display-only (DESIGN.md: forgeable,
// so nothing reads them to gate anything). Versioned like svf:stats; a newer build's
// record is left alone rather than downgraded.
export const STATS_KEY = "tower:stats";

/** The handle last used on the board; the server sanitizes it to the same length. */
export const HANDLE_MAX = 12;
const COUNT_CAP = 999_999_999;

export type TowerStats = {
  v: 1;
  bestFree: number;
  /** Best daily score and its UTC day. */
  bestDaily: { day: string; score: number } | null;
  runs: number;
  /** Last UTC day with a finished daily tower, and the streak of consecutive such days. */
  lastDailyDay: string | null;
  streakDays: number;
  bestStreakDays: number;
  /** The first-run hint was dismissed by a landing. */
  seenHint: boolean;
  /** The handle last used on the board (sanitized on the server; capped at 12 here). */
  handle: string;
};

export const EMPTY_STATS: TowerStats = {
  v: 1,
  bestFree: 0,
  bestDaily: null,
  runs: 0,
  lastDailyDay: null,
  streakDays: 0,
  bestStreakDays: 0,
  seenHint: false,
  handle: "",
};

const count = z
  .number()
  .finite()
  .transform((n) => Math.min(COUNT_CAP, Math.max(0, Math.floor(n))))
  .catch(0);

const dayText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .catch(null);

const statsSchema = z.object({
  v: z.literal(1),
  bestFree: count,
  bestDaily: z
    .object({
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      score: z.number().finite().min(0).transform(Math.floor),
    })
    .nullable()
    .catch(null),
  runs: count,
  lastDailyDay: dayText,
  streakDays: count,
  bestStreakDays: count,
  seenHint: z.boolean().catch(false),
  handle: z
    .string()
    .transform((text) => text.slice(0, HANDLE_MAX))
    .catch(""),
});

export function parseStats(raw: unknown): TowerStats {
  const result = statsSchema.safeParse(raw);
  if (!result.success) return structuredClone(EMPTY_STATS);
  const data = result.data;
  // The best streak can never be below the current one.
  return { ...data, bestStreakDays: Math.max(data.bestStreakDays, data.streakDays) };
}

export function loadStats(): TowerStats {
  let text: string | null;
  try {
    text = window.localStorage.getItem(STATS_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means empty statistics
    return structuredClone(EMPTY_STATS);
  }
  if (text === null) return structuredClone(EMPTY_STATS);
  return parseStats(safeJsonParse<unknown>(text, "tower:stats"));
}

export function saveStats(stats: TowerStats): void {
  // A newer build wrote this: leave it alone rather than downgrade it.
  if (storedVersionIsNewer(STATS_KEY)) return;
  safeLocalSet(STATS_KEY, JSON.stringify(stats));
}

/** The UTC day before `dayKey` ("2026-10-16" -> "2026-10-15"). */
function previousDay(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  return new Date(date.getTime() - 86_400_000).toISOString().slice(0, 10);
}

export type RunRecord = {
  mode: "daily" | "free";
  score: number;
  /** The UTC day the run was played on, "YYYY-MM-DD". */
  day: string;
};

/**
 * Folds one finished run in. Every run counts; a best rises only on a strictly higher
 * score. Only a finished daily tower touches the streak: a repeat of the same day keeps
 * it, the next UTC day extends it, a gap, or a last day ahead of the run, restarts it at one.
 */
export function recordRun(stats: TowerStats, run: RunRecord): TowerStats {
  const next = structuredClone(stats);
  const score = Math.max(0, Math.floor(run.score));
  next.runs = Math.min(COUNT_CAP, next.runs + 1);
  if (run.mode === "free") {
    next.bestFree = Math.max(next.bestFree, score);
    return next;
  }
  if (next.bestDaily === null || score > next.bestDaily.score) {
    next.bestDaily = { day: run.day, score };
  }
  const last = next.lastDailyDay;
  if (last === run.day) return next;
  // A last day ahead of this run means the clock was wrong once; restart on the run's day
  // rather than freeze the streak until real time catches up (the same call as PG2's streak).
  next.streakDays = last === previousDay(run.day) ? Math.min(COUNT_CAP, next.streakDays + 1) : 1;
  next.bestStreakDays = Math.max(next.bestStreakDays, next.streakDays);
  next.lastDailyDay = run.day;
  return next;
}

/** The streak as it stands today: it lapses once a whole UTC day passes with no daily tower. */
export function activeStreak(stats: TowerStats, today: string): number {
  const { lastDailyDay, streakDays } = stats;
  return lastDailyDay === today || lastDailyDay === previousDay(today) ? streakDays : 0;
}

/** Marks the first-run hint dismissed; returns the same object when it already was. */
export function markHintSeen(stats: TowerStats): TowerStats {
  return stats.seenHint ? stats : { ...stats, seenHint: true };
}

/** Remembers the handle last used on the board; returns the same object when unchanged. */
export function setHandle(stats: TowerStats, handle: string): TowerStats {
  const next = handle.slice(0, HANDLE_MAX);
  return stats.handle === next ? stats : { ...stats, handle: next };
}
