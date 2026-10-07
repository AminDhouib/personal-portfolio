import { z } from "zod";
import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";
import { storedVersionIsNewer } from "./stored-version";
import { MAX_LEVEL } from "./hgss";
import { previousDay } from "./daily-board";

// Local statistics. Their own key, never uploaded, display-only (DESIGN.md:
// forgeable, so nothing reads them to gate anything). The streak and daily
// fields exist from the first version (zero) so the Daily board (T2e-3) does
// not change the shape.
export const STATS_KEY = "svf:stats";

/** A round that began at Lv.8 adds at most this many seconds (a forgotten tab). */
export const LV8_SECONDS_PER_ROUND_CAP = 3600;
const COUNT_CAP = 999_999_999;

export type Stats = {
  rounds: { played: number; won: number; lost: number; quit: number };
  /** Rounds played with the odds assist on. Counted in `played`, nowhere else. */
  assistedRounds: number;
  coins: { total: number; best: number };
  highestLevel: number;
  /** Seconds spent in rounds that began at Lv.8. */
  lv8Seconds: number;
  /** Consecutive UTC days with a completed daily board; lastDay is "YYYY-MM-DD". */
  streak: { current: number; best: number; lastDay: string | null };
  dailyPlayed: number;
};

export const EMPTY_STATS: Stats = {
  rounds: { played: 0, won: 0, lost: 0, quit: 0 },
  assistedRounds: 0,
  coins: { total: 0, best: 0 },
  highestLevel: 1,
  lv8Seconds: 0,
  streak: { current: 0, best: 0, lastDay: null },
  dailyPlayed: 0,
};

const count = z
  .number()
  .transform((n) => Math.min(COUNT_CAP, Math.max(0, Math.floor(n))))
  .catch(0);

const dayText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .catch(null);

const statsSchema = z.object({
  v: z.literal(1),
  rounds: z
    .object({ played: count, won: count, lost: count, quit: count })
    .catch({ ...EMPTY_STATS.rounds }),
  assistedRounds: count,
  coins: z.object({ total: count, best: count }).catch({ ...EMPTY_STATS.coins }),
  highestLevel: z
    .number()
    .transform((n) => Math.min(MAX_LEVEL, Math.max(1, Math.floor(n))))
    .catch(1),
  lv8Seconds: count,
  streak: z
    .object({ current: count, best: count, lastDay: dayText })
    .catch({ ...EMPTY_STATS.streak }),
  dailyPlayed: count,
});

export function parseStats(raw: unknown): Stats {
  const result = statsSchema.safeParse(raw);
  if (!result.success) return structuredClone(EMPTY_STATS);
  const { rounds, assistedRounds, coins, highestLevel, lv8Seconds, streak, dailyPlayed } =
    result.data;
  return {
    rounds,
    assistedRounds,
    coins,
    highestLevel,
    lv8Seconds,
    // best can never be below current.
    streak: { ...streak, best: Math.max(streak.best, streak.current) },
    dailyPlayed,
  };
}

export function loadStats(): Stats {
  let text: string | null;
  try {
    text = window.localStorage.getItem(STATS_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means empty statistics
    return structuredClone(EMPTY_STATS);
  }
  if (text === null) return structuredClone(EMPTY_STATS);
  return parseStats(safeJsonParse<unknown>(text, "voltorb:stats"));
}

export function saveStats(stats: Stats): void {
  // A newer build wrote this: leave it alone rather than downgrade it.
  if (storedVersionIsNewer(STATS_KEY)) return;
  safeLocalSet(STATS_KEY, JSON.stringify({ v: 1, ...stats }));
}

export type RoundRecord = {
  outcome: "won" | "lost" | "quit";
  /** Coins banked this round (0 for a loss). */
  coins: number;
  /** The level the round began at. */
  level: number;
  /** The level after the result (the save moves it the moment a round ends). */
  levelAfter?: number;
  assisted: boolean;
  /** Round length in whole seconds. */
  seconds: number;
};

/**
 * Folds one finished round in. An assisted round counts as played and assisted
 * and nothing else, so the record numbers (wins, coins, best) stay honest.
 * Highest level mirrors svf:progress, so it counts every round.
 */
export function recordRound(stats: Stats, round: RoundRecord): Stats {
  const next = structuredClone(stats);
  next.rounds.played = Math.min(COUNT_CAP, next.rounds.played + 1);
  const reached = Math.max(round.level, round.levelAfter ?? 0);
  next.highestLevel = Math.max(next.highestLevel, Math.min(MAX_LEVEL, Math.max(1, reached)));
  if (round.level >= MAX_LEVEL) {
    const seconds = Math.min(LV8_SECONDS_PER_ROUND_CAP, Math.max(0, Math.floor(round.seconds)));
    next.lv8Seconds = Math.min(COUNT_CAP, next.lv8Seconds + seconds);
  }
  if (round.assisted) {
    next.assistedRounds = Math.min(COUNT_CAP, next.assistedRounds + 1);
    return next;
  }
  if (round.outcome === "won") next.rounds.won += 1;
  else if (round.outcome === "lost") next.rounds.lost += 1;
  else next.rounds.quit += 1;
  const coins = Math.max(0, Math.floor(round.coins));
  next.coins.total = Math.min(COUNT_CAP, next.coins.total + coins);
  next.coins.best = Math.max(next.coins.best, coins);
  return next;
}

/**
 * Folds one finished Daily board in. Every finished board counts as played. Only a
 * completed one (coins banked) extends the streak: it continues it when the last
 * day was yesterday, restarts it at one after a gap, and a repeat of the same day
 * changes nothing. A loss or a 0-coin quit neither extends nor breaks a live
 * streak: it carries the streak's day forward, so only a missed day lapses it.
 */
export function recordDay(stats: Stats, dayKey: string, completed: boolean): Stats {
  const next = structuredClone(stats);
  // A clock that moved backwards must not pull the streak back with it.
  if (completed && next.streak.lastDay !== null && dayKey < next.streak.lastDay) return next;
  next.dailyPlayed = Math.min(COUNT_CAP, next.dailyPlayed + 1);
  if (!completed) {
    if (next.streak.lastDay === previousDay(dayKey)) next.streak.lastDay = dayKey;
    return next;
  }
  if (next.streak.lastDay === dayKey) return next;
  const continues = next.streak.lastDay === previousDay(dayKey);
  next.streak.current = continues ? Math.min(COUNT_CAP, next.streak.current + 1) : 1;
  next.streak.best = Math.max(next.streak.best, next.streak.current);
  next.streak.lastDay = dayKey;
  return next;
}

/** The streak as it stands today: it lapses once a whole UTC day passes with no board played. */
export function activeStreak(stats: Stats, today: string): number {
  const { lastDay, current } = stats.streak;
  return lastDay === today || lastDay === previousDay(today) ? current : 0;
}
