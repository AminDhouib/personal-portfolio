import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";

// The player's Failover record on this device, under failover:stats: the best
// survival time and score, how many runs ended, and the last Daily Incident
// day played. Versioned JSON, checked by hand (no zod in the game's chunks).

export const STATS_KEY = "failover:stats";

export interface FailoverStats {
  /** Longest survival run, in whole game seconds. */
  bestSeconds: number;
  /** Best survival score (scoreOf). */
  bestScore: number;
  /** Runs that reached their end. */
  runs: number;
  /** The last Daily Incident's UTC day ("2026-10-09"), or null before the first. */
  lastDailyDay: string | null;
}

export const EMPTY_STATS: FailoverStats = {
  bestSeconds: 0,
  bestScore: 0,
  runs: 0,
  lastDailyDay: null,
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** A stored record, or null when it is not exactly a version-1 record (extra fields are ignored). */
export function parseStats(raw: unknown): FailoverStats | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return null;
  if (!count(r.bestSeconds) || !count(r.bestScore) || !count(r.runs)) return null;
  const day = r.lastDailyDay;
  if (day !== null && (typeof day !== "string" || !DAY.test(day))) return null;
  return { bestSeconds: r.bestSeconds, bestScore: r.bestScore, runs: r.runs, lastDailyDay: day };
}

function readRaw(): unknown {
  let text: string | null;
  try {
    text = window.localStorage.getItem(STATS_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means no record
    return null;
  }
  return text === null ? null : safeJsonParse<unknown>(text, "failover:stats");
}

export function loadStats(): FailoverStats {
  return parseStats(readRaw()) ?? EMPTY_STATS;
}

/** Fold one finished run into the record. Pure; negative or fractional inputs count as floored and zero. */
export function recordRun(
  stats: FailoverStats,
  run: { seconds: number; score: number },
): FailoverStats {
  const whole = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  return {
    ...stats,
    bestSeconds: Math.max(stats.bestSeconds, whole(run.seconds)),
    bestScore: Math.max(stats.bestScore, whole(run.score)),
    runs: stats.runs + 1,
  };
}

/** Write the record, unless a newer build already wrote a later version. */
export function saveStats(stats: FailoverStats): void {
  const stored = readRaw();
  if (typeof stored === "object" && stored !== null) {
    const v = (stored as { v?: unknown }).v;
    if (typeof v === "number" && v > 1) return;
  }
  safeLocalSet(
    STATS_KEY,
    JSON.stringify({
      v: 1,
      bestSeconds: stats.bestSeconds,
      bestScore: stats.bestScore,
      runs: stats.runs,
      lastDailyDay: stats.lastDailyDay,
    }),
  );
}
