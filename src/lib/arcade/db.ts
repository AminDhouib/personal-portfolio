import type { Pool } from "pg";
import { getPool } from "@/lib/db";
import { logWarn } from "@/lib/log";
import type { LegacyImportReport } from "./legacy-import";
import { ensureArcadeSchema } from "./schema";

// Prod's Postgres volume was initialized before the arcade tables existed, so
// db/init.sql does NOT run there. This repo's compose deploy has no migration runner, so
// the sanctioned pattern (the same one the Password Game 2 route uses) is a runtime
// ensure: run the idempotent DDL once per process, before the first query, awaited by
// every handler. On fresh volumes init.sql already created the tables, so it is a no-op.
let ensured: Promise<void> | null = null;

/**
 * The one place the legacy import is reported (the importer itself stays free of
 * `@/lib/log`, which needs the app environment). Prod verification greps for this line.
 */
function reportLegacyImport(report: LegacyImportReport): void {
  switch (report.status) {
    case "already-applied":
      return;
    case "no-legacy-table":
      logWarn(
        "arcade:legacy-import",
        "no leaderboard_entries table: recorded the import as done with nothing to import",
      );
      return;
    case "imported":
      logWarn(
        "arcade:legacy-import",
        `imported ${report.scores} scores for ${report.players} players (read ${report.read}, skipped ${report.skippedUnverifiable} unverifiable and ${report.skippedImplausible} implausible)`,
      );
      return;
  }
}

/**
 * The shared pool, after the arcade tables are guaranteed to exist. A failed ensure is
 * not cached: the memo is cleared so the next request retries.
 */
export async function getArcadePool(): Promise<Pool> {
  const pool = getPool();
  if (!ensured) {
    const attempt: Promise<void> = ensureArcadeSchema(pool)
      .then(reportLegacyImport)
      .catch((err: unknown) => {
        // Only clear our own attempt; a newer one may already be in flight.
        if (ensured === attempt) ensured = null;
        throw err;
      });
    ensured = attempt;
  }
  await ensured;
  return pool;
}
