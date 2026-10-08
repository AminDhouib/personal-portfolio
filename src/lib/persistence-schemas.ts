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
import { LEGACY_ARCADE_GAME_SLUGS } from "@/lib/arcade/games";

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

/**
 * node-postgres returns BIGINT as a string and TIMESTAMPTZ as a Date. These two
 * coercions are the only place the arcade store reconciles driver types with the JSON
 * the client reads: pgInteger accepts an integer number or a decimal string of at most
 * 15 digits (so it can never lose precision), and pgTimestamp turns a Date into an ISO
 * string.
 */
const pgInteger = z.union([
  z.number().int(),
  z
    .string()
    .regex(/^-?\d{1,15}$/)
    .transform(Number),
]);
const pgTimestamp = z.union([z.date().transform((d) => d.toISOString()), z.iso.datetime()]);

/** One ranked row of an arcade board as the store reads it. Strict: an unexpected column fails. */
export const arcadeBoardRowSchema = z.strictObject({
  rank: pgInteger,
  handle: z.string(),
  score: pgInteger,
  detail: z.record(z.string(), z.union([z.number(), z.boolean()])),
  achievedAt: pgTimestamp,
  isYou: z.boolean(),
});
export type ArcadeBoardRow = z.infer<typeof arcadeBoardRowSchema>;

/** The caller's own rank and score on a board (the "Your best" line). */
export const arcadeYouRowSchema = z.strictObject({ rank: pgInteger, score: pgInteger });
export type ArcadeYouRow = z.infer<typeof arcadeYouRowSchema>;

/** A player's stored best on one board, read back after a submit. */
export const arcadeBestRowSchema = z.strictObject({ score: pgInteger, rank: pgInteger });

/** The stored token hash used for the trust-on-first-use identity check. */
export const arcadeTokenRowSchema = z.strictObject({ token_hash: z.string().min(1) });

/**
 * A row of the legacy leaderboard_entries table as the one-time arcade import reads it
 * (src/lib/arcade/legacy-import.ts). INTEGER columns arrive as numbers; seconds, kills and
 * distance are nullable because old rows (and games that never sent them) hold NULLs.
 * Only the two arcade games can appear: the import query filters on them, and any other
 * value is a bug that must abort the import rather than be skipped.
 */
export const legacyLeaderboardRowSchema = z.strictObject({
  id: pgInteger,
  game: z.enum(LEGACY_ARCADE_GAME_SLUGS),
  name: z.string(),
  score: pgInteger,
  level: pgInteger,
  seconds: pgInteger.nullable(),
  kills: pgInteger.nullable(),
  distance: pgInteger.nullable(),
  created_at: pgTimestamp,
});
export type LegacyLeaderboardRow = z.infer<typeof legacyLeaderboardRowSchema>;

// Lead schema removed: leads are now in Postgres; the LeadRecord type lives
// in src/lib/leads-store.ts next to the query code.
