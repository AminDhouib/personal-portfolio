/**
 * Server-only zod schemas for the three persisted surfaces, now stored in
 * Postgres (schema v2, pass-2 audit break+reset: audit/pass2/findings-pass2.json
 * P2-DATA-001/002/005/009/010). Every file/line carries an explicit
 * schemaVersion so a reader can tell "old shape" from "corrupt" instead of
 * guessing. v1 files (unversioned flat arrays) are NOT readable by these
 * schemas on purpose -- the store quarantines them and starts fresh
 * (archive-then-reset, RUNBOOK "Schema reset").
 *
 * TYPE exports are safe to `import type` from client modules (erased at
 * compile time, no zod in the bundle); the schema VALUES are server-only.
 */
import { z } from "zod";

export const PERSISTENCE_SCHEMA_VERSION = 1;

/**
 * One row on a per-game board. The game slug is NOT a row field -- it is the
 * bucket key in `boards`, so a row cannot disagree with the board it sits in
 * (v1's optional `game` field plus `?? "space-shooter"` fallbacks was the
 * root of the merged-bucket bug, RC-1).
 * seconds/kills/distance are per-game extras (space-shooter sends all three,
 * hextris/tower-stacker send none today); absent means the game does not
 * track that stat.
 */
export const gameLeaderboardRowSchema = z.object({
  name: z.string(),
  score: z.number(),
  level: z.number(),
  seconds: z.number().optional(),
  kills: z.number().optional(),
  distance: z.number().optional(),
  region: z.string().optional(),
  createdAt: z.iso.datetime(),
});
export type GameLeaderboardRow = z.infer<typeof gameLeaderboardRowSchema>;

/** On-disk shape of leaderboard.json: boards keyed by game slug. */
export const gameLeaderboardFileSchema = z.object({
  schemaVersion: z.literal(PERSISTENCE_SCHEMA_VERSION),
  boards: z.record(z.string(), z.array(gameLeaderboardRowSchema)),
});
export type GameLeaderboardFile = z.infer<typeof gameLeaderboardFileSchema>;

export function emptyGameLeaderboardFile(): GameLeaderboardFile {
  return { schemaVersion: PERSISTENCE_SCHEMA_VERSION, boards: {} };
}

/**
 * One password-game run. elapsedSeconds (was v1 `time`) and ruleCount (was
 * v1 `rules`) carry their unit/meaning in the name (P2-DATA-009).
 */
export const passwordGameLeaderboardEntrySchema = z.object({
  name: z.string(),
  seed: z.number(),
  elapsedSeconds: z.number(),
  ruleCount: z.number(),
  createdAt: z.iso.datetime(),
});

/** On-disk shape of password-game-leaderboard.json. */
export const passwordGameLeaderboardFileSchema = z.object({
  schemaVersion: z.literal(PERSISTENCE_SCHEMA_VERSION),
  entries: z.array(passwordGameLeaderboardEntrySchema),
});
export type PasswordGameLeaderboardFile = z.infer<typeof passwordGameLeaderboardFileSchema>;

export function emptyPasswordGameLeaderboardFile(): PasswordGameLeaderboardFile {
  return { schemaVersion: PERSISTENCE_SCHEMA_VERSION, entries: [] };
}

// Lead schema removed: leads are now in Postgres; the LeadRecord type lives
// in src/lib/leads-store.ts next to the query code.
