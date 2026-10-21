import { dailySeed } from "@/components/game/password-game-2/engine/rng";

/** PG2 seeds are unsigned 32-bit integers (the generator is `>>> 0`, the daily seed an FNV-1a hash). */
export const SEED_MAX = 0xffffffff; // 2^32 - 1
export const TIME_MS_MIN = 10_000; // 10s floor: a full run cannot be faster
export const TIME_MS_MAX = 3_600_000; // 1h ceiling

/** Per-seed board depth: each seed keeps its fastest N runs. */
export const MAX_ENTRIES_PER_SEED = 500;

/**
 * Whole-table ceiling. Seeds are free (any 32-bit integer), so the per-seed trim alone lets one
 * row per random seed grow the table without limit. Past this many rows the slowest are evicted,
 * which keeps the all-time board's fastest runs and today's competitive daily times.
 */
export const MAX_TOTAL_ROWS = 20_000;

/**
 * How long past midnight UTC the previous day's daily seed still posts. The shell stamps a run
 * with the day it STARTED (DESIGN.md), and a run is at most TIME_MS_MAX long, so a run begun just
 * before 00:00 UTC finishes inside this window. The extra minute covers submit latency.
 */
export const DAILY_GRACE_MS = TIME_MS_MAX + 60_000;

const DAY_MS = 86_400_000;

/**
 * Parse a `?seed=` query value: plain decimal digits in 0..SEED_MAX, nothing else. `Number()` would
 * let "1.5", "1e30" and "0x10" through to a Postgres bigint cast error (a 500 and a Sentry event
 * for what is a client mistake), so the shape is checked first. Null means "reject with 400".
 */
export function parseSeedParam(raw: string): number | null {
  if (!/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= SEED_MAX ? n : null;
}

/**
 * Whether `seed` is a daily seed the server will accept for a `daily: true` submission at `now`:
 * today's UTC seed, or yesterday's during the grace window after midnight UTC.
 */
export function isAcceptedDailySeed(seed: number, now: Date = new Date()): boolean {
  if (seed === dailySeed(now)) return true;
  const startOfDay = now.getTime() - (now.getTime() % DAY_MS);
  if (now.getTime() - startOfDay >= DAILY_GRACE_MS) return false;
  return seed === dailySeed(new Date(startOfDay - 1));
}

/**
 * The pg2 leaderboard table and indexes, as idempotent single statements run once per process by
 * the route (prod's volume predates the table, so db/init.sql never runs there). db/init.sql
 * carries an exact mirror for fresh volumes and pg2-leaderboard.test.ts fails if the two drift.
 * Keep the text free of comments and semicolons: the test compares whitespace-collapsed text.
 *
 * Read paths and the index each uses:
 * - `?seed=N` and `?daily=1` (filtered to today's daily seed): (seed, time_ms)
 * - the unfiltered top 50 and the global-cap delete: (time_ms, id)
 */
export const PG2_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS pg2_leaderboard_entries (
    id              SERIAL PRIMARY KEY,
    name            TEXT        NOT NULL,
    seed            BIGINT      NOT NULL,
    time_ms         INTEGER     NOT NULL,
    daily           BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pg2_leaderboard_seed_time
    ON pg2_leaderboard_entries (seed, time_ms ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_pg2_leaderboard_time_id
    ON pg2_leaderboard_entries (time_ms ASC, id ASC)`,
];
