import { importLegacyLeaderboard, type LegacyImportReport } from "./legacy-import";
import { withTransaction, type TxPool } from "./tx";

/**
 * Arbitrary constant, unique to this feature, that serializes concurrent ensure runs
 * (two app instances booting, or two first requests racing) with a transaction-scoped
 * advisory lock. It is released automatically at COMMIT or ROLLBACK.
 */
export const ARCADE_SCHEMA_LOCK_ID = 7_300_100_201;

/**
 * The arcade tables, as idempotent single statements. db/init.sql carries an exact
 * mirror for fresh volumes and schema.test.ts fails if the two drift. A new arcade
 * table goes HERE and in db/init.sql (DESIGN.md "Arcade backend"). Keep the text free of
 * comments and semicolons: the test compares whitespace-collapsed text.
 *
 * score is BIGINT so a future game is not bound by int4; node-postgres returns BIGINT as
 * a string, and the row pins in persistence-schemas.ts coerce it. detail is the
 * per-game validated numbers (and, for imported legacy rows, a legacy marker).
 */
export const ARCADE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS arcade_players (
    id           UUID        PRIMARY KEY,
    token_hash   TEXT        NOT NULL,
    handle       TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS arcade_scores (
    game        TEXT        NOT NULL,
    board       TEXT        NOT NULL,
    player_id   UUID        NOT NULL REFERENCES arcade_players (id) ON DELETE CASCADE,
    score       BIGINT      NOT NULL,
    detail      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    achieved_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (game, board, player_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_arcade_scores_rank
    ON arcade_scores (game, board, score DESC, achieved_at ASC)`,
  `CREATE TABLE IF NOT EXISTS arcade_migrations (
    key        TEXT        PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
];

/**
 * Create the arcade tables if they do not exist, then run the one-time legacy import
 * (a no-op once its marker row exists). Safe to run any number of times, concurrently:
 * the advisory lock serializes starters, and the import shares the DDL's transaction, so
 * a failed import rolls the marker back and the next start retries.
 */
export async function ensureArcadeSchema(pool: TxPool): Promise<LegacyImportReport> {
  return withTransaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [ARCADE_SCHEMA_LOCK_ID]);
    for (const statement of ARCADE_SCHEMA_STATEMENTS) {
      await client.query(statement);
    }
    return importLegacyLeaderboard(client);
  });
}
