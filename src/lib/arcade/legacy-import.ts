import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { legacyLeaderboardRowSchema, type LegacyLeaderboardRow } from "@/lib/persistence-schemas";
import { sanitizePlayerName } from "@/lib/player-name";
import { ARCADE_GAME_SLUGS, validateArcadeSubmission, type ArcadeGameSlug } from "./games";

// Renaming this key would re-run the import: it is the "already done" marker row.
const MIGRATION_KEY = "legacy-leaderboard-import-v1";
// Never equal to a 64-character sha256 hex digest, so imported players cannot be claimed.
const LEGACY_TOKEN_HASH = "legacy";
const HANDLE_MAX = 12;

/** What one run of the import did; db.ts logs it once. */
export type LegacyImportReport =
  | { status: "already-applied" }
  | { status: "no-legacy-table" }
  | {
      status: "imported";
      read: number;
      skippedUnverifiable: number;
      skippedImplausible: number;
      players: number;
      scores: number;
    };

type LegacyClient = Pick<PoolClient, "query">;

interface Candidate {
  id: number;
  game: ArcadeGameSlug;
  handle: string;
  score: number;
  detail: Record<string, number>;
  createdAt: string;
}

// ON CONFLICT DO NOTHING RETURNING yields a row only for the first run; the advisory lock
// held by ensureArcadeSchema serializes concurrent starters.
const MARK_APPLIED = `INSERT INTO arcade_migrations (key) VALUES ($1) ON CONFLICT (key) DO NOTHING RETURNING key`;

// A database that never had the legacy table must not fail the ensure-step forever.
const LEGACY_TABLE_PRESENT = `SELECT to_regclass('leaderboard_entries') IS NOT NULL AS present`;

// region is deliberately not read. Oldest first, so a strictly-higher-score rule keeps the
// earlier achiever on ties.
const READ_LEGACY = `SELECT id, game, name, score, level, seconds, kills, distance, created_at
  FROM leaderboard_entries
  WHERE game = ANY($1::text[])
  ORDER BY created_at ASC, id ASC`;

const INSERT_LEGACY_PLAYER = `INSERT INTO arcade_players (id, token_hash, handle, created_at, last_seen_at)
  VALUES ($1, $2, $3, $4, $4)`;

const INSERT_LEGACY_SCORE = `INSERT INTO arcade_scores (game, board, player_id, score, detail, achieved_at)
  VALUES ($1, 'all-time', $2, $3, $4::jsonb, $5)`;

/** The detail a legacy row can supply for its game, or null when a needed column is NULL. */
function legacyDetail(
  game: ArcadeGameSlug,
  row: LegacyLeaderboardRow,
): Record<string, number> | null {
  if (row.seconds === null || row.kills === null) return null;
  switch (game) {
    case "space-shooter":
      return row.distance === null
        ? null
        : { seconds: row.seconds, kills: row.kills, distance: row.distance };
    case "hextris":
      return { seconds: row.seconds, kills: row.kills, level: row.level };
  }
}

function compareIso(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * One-time import of the legacy leaderboard_entries rows of Orbital Dodge and Hextris
 * into the arcade tables. Runs inside ensureArcadeSchema's transaction, after the DDL:
 * the marker row is inserted first, so a failure anywhere rolls the marker back with
 * everything else and the next start retries. Rows that cannot be verified (NULL detail
 * columns) or fail the game's plausibility check are skipped and counted. Players are
 * grouped by lower-cased sanitized handle across both games; each gets the unclaimable
 * 'legacy' token hash. Only the all-time board is written, with the original timestamp.
 */
export async function importLegacyLeaderboard(
  client: LegacyClient,
  newId: () => string = randomUUID,
): Promise<LegacyImportReport> {
  const marked = await client.query(MARK_APPLIED, [MIGRATION_KEY]);
  if (marked.rows.length === 0) return { status: "already-applied" };

  const table = await client.query(LEGACY_TABLE_PRESENT);
  if (table.rows[0]?.present !== true) return { status: "no-legacy-table" };

  const result = await client.query(READ_LEGACY, [[...ARCADE_GAME_SLUGS]]);
  let skippedUnverifiable = 0;
  let skippedImplausible = 0;
  const best = new Map<string, Candidate>();
  for (const raw of result.rows) {
    const row = legacyLeaderboardRowSchema.parse(raw);
    const detail = legacyDetail(row.game, row);
    if (detail === null) {
      skippedUnverifiable += 1;
      continue;
    }
    const verdict = validateArcadeSubmission(row.game, row.score, detail);
    if (!verdict.ok) {
      skippedImplausible += 1;
      continue;
    }
    const handle = sanitizePlayerName(row.name, { maxLength: HANDLE_MAX, fallback: "Pilot" });
    const candidate: Candidate = {
      id: row.id,
      game: row.game,
      handle,
      score: row.score,
      // The row's own detail (already shown valid by the verdict), so the stored key order
      // does not depend on how the game's schema orders its output.
      detail,
      createdAt: row.created_at,
    };
    const key = `${row.game}|${handle.toLowerCase()}`;
    const current = best.get(key);
    // Rows arrive oldest first: only a strictly higher score replaces, so ties keep the earlier row.
    if (current === undefined || candidate.score > current.score) best.set(key, candidate);
  }

  // Best row first: the first row seen for a handle names the player and supplies the
  // display form; the player's created_at is the earliest of their kept rows.
  const ordered = [...best.values()].sort(
    (a, b) => b.score - a.score || compareIso(a.createdAt, b.createdAt) || a.id - b.id,
  );
  const players = new Map<string, { id: string; handle: string; createdAt: string }>();
  const placements: { candidate: Candidate; playerId: string }[] = [];
  for (const candidate of ordered) {
    const playerKey = candidate.handle.toLowerCase();
    let player = players.get(playerKey);
    if (player === undefined) {
      player = { id: newId(), handle: candidate.handle, createdAt: candidate.createdAt };
      players.set(playerKey, player);
    } else if (compareIso(candidate.createdAt, player.createdAt) < 0) {
      player.createdAt = candidate.createdAt;
    }
    placements.push({ candidate, playerId: player.id });
  }

  for (const player of players.values()) {
    await client.query(INSERT_LEGACY_PLAYER, [
      player.id,
      LEGACY_TOKEN_HASH,
      player.handle,
      player.createdAt,
    ]);
  }
  for (const { candidate, playerId } of placements) {
    await client.query(INSERT_LEGACY_SCORE, [
      candidate.game,
      playerId,
      candidate.score,
      JSON.stringify({ ...candidate.detail, legacy: true }),
      candidate.createdAt,
    ]);
  }

  return {
    status: "imported",
    read: result.rows.length,
    skippedUnverifiable,
    skippedImplausible,
    players: players.size,
    scores: placements.length,
  };
}
