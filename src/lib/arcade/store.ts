import { createHash, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import {
  arcadeBestRowSchema,
  arcadeBoardRowSchema,
  arcadeTokenRowSchema,
  arcadeYouRowSchema,
  type ArcadeBoardRow,
  type ArcadeYouRow,
} from "@/lib/persistence-schemas";
import { BOARD_PERIODS, boardKey, retentionCutoffs, type BoardPeriod } from "./boards";
import type { ArcadeGameSlug } from "./games";
import { withTransaction, type TxPool } from "./tx";

const BOARD_LIMIT = 25;

interface SubmitInput {
  game: ArcadeGameSlug;
  playerId: string;
  token: string;
  handle: string;
  score: number;
  detail: Record<string, number>;
}

interface BoardResult {
  period: BoardPeriod;
  board: string;
  rank: number;
  best: number;
  improved: boolean;
}

type SubmitOutcome = { ok: true; boards: BoardResult[] } | { ok: false; error: "identity" };

/** Thrown inside the transaction so everything rolls back; never leaves this module. */
class IdentityMismatchError extends Error {}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison of two hex digests. timingSafeEqual throws on unequal
 * lengths, so the length is compared first. A legacy-imported player's stored hash is the
 * 6-character string "legacy", which can never equal a 64-character digest, so those
 * players can never be claimed.
 */
function sameHash(stored: string, candidate: string): boolean {
  const a = Buffer.from(stored, "utf8");
  const b = Buffer.from(candidate, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

const INSERT_PLAYER = `INSERT INTO arcade_players (id, token_hash, handle)
  VALUES ($1, $2, $3)
  ON CONFLICT (id) DO NOTHING`;

// Locks the row, so two submits by the same player serialize behind each other.
const LOCK_PLAYER = `SELECT token_hash FROM arcade_players WHERE id = $1 FOR UPDATE`;

const TOUCH_PLAYER = `UPDATE arcade_players SET handle = $2, last_seen_at = $3 WHERE id = $1`;

// A row is replaced only by a strictly higher score; RETURNING yields a row only when it
// was inserted or replaced, which is what "improved" means.
const UPSERT_SCORE = `INSERT INTO arcade_scores (game, board, player_id, score, detail, achieved_at)
  VALUES ($1, $2, $3, $4, $5::jsonb, $6)
  ON CONFLICT (game, board, player_id) DO UPDATE
    SET score = EXCLUDED.score, detail = EXCLUDED.detail, achieved_at = EXCLUDED.achieved_at
    WHERE EXCLUDED.score > arcade_scores.score
  RETURNING score`;

// COLLATE "C" makes the comparison byte-wise, so the zero-padded keys order
// chronologically whatever the database locale is.
const PRUNE_OLD_BOARDS = `DELETE FROM arcade_scores
  WHERE game = $1
    AND ((board LIKE 'daily:%' AND board COLLATE "C" < $2)
      OR (board LIKE 'weekly:%' AND board COLLATE "C" < $3))`;

// Rank = 1 + the number of rows ahead: a higher score, or an equal score reached earlier.
const BEST_AND_RANK = `SELECT s.score,
    (1 + (SELECT count(*) FROM arcade_scores o
           WHERE o.game = s.game AND o.board = s.board
             AND (o.score > s.score OR (o.score = s.score AND o.achieved_at < s.achieved_at))))::int AS rank
  FROM arcade_scores s
  WHERE s.game = $1 AND s.board = $2 AND s.player_id = $3`;

/**
 * Record one validated score for one player on the all-time, weekly and daily boards in a
 * single transaction: claim or verify the identity, upsert the three boards, prune this
 * game's expired boards, read the resulting rank and best back. The caller has already
 * validated the body and the plausibility of the score; the board keys come from `now`
 * here, never from the client.
 */
export async function submitScore(
  pool: TxPool,
  input: SubmitInput,
  now: Date,
): Promise<SubmitOutcome> {
  const tokenHash = hashToken(input.token);
  try {
    return await withTransaction(pool, async (client): Promise<SubmitOutcome> => {
      await client.query(INSERT_PLAYER, [input.playerId, tokenHash, input.handle]);
      const locked = await client.query(LOCK_PLAYER, [input.playerId]);
      const stored = arcadeTokenRowSchema.parse(locked.rows[0]);
      if (!sameHash(stored.token_hash, tokenHash)) throw new IdentityMismatchError();
      await client.query(TOUCH_PLAYER, [input.playerId, input.handle, now]);

      const detailJson = JSON.stringify(input.detail);
      const improved: boolean[] = [];
      for (const period of BOARD_PERIODS) {
        const result = await client.query(UPSERT_SCORE, [
          input.game,
          boardKey(period, now),
          input.playerId,
          input.score,
          detailJson,
          now,
        ]);
        improved.push(result.rows.length > 0);
      }

      const cutoffs = retentionCutoffs(now);
      await client.query(PRUNE_OLD_BOARDS, [input.game, cutoffs.daily, cutoffs.weekly]);

      const boards: BoardResult[] = [];
      for (const [index, period] of BOARD_PERIODS.entries()) {
        const board = boardKey(period, now);
        const read = await client.query(BEST_AND_RANK, [input.game, board, input.playerId]);
        const row = read.rows[0];
        if (row === undefined) throw new Error("arcade score row missing after upsert");
        const best = arcadeBestRowSchema.parse(row);
        boards.push({
          period,
          board,
          rank: best.rank,
          best: best.score,
          improved: improved[index] === true,
        });
      }
      return { ok: true, boards };
    });
  } catch (err) {
    if (err instanceof IdentityMismatchError) return { ok: false, error: "identity" };
    throw err;
  }
}

const RANKED_ROWS = `SELECT player_id, score, detail, achieved_at,
    rank() OVER (ORDER BY score DESC, achieved_at ASC) AS rank
  FROM arcade_scores
  WHERE game = $1 AND board = $2`;

// Only the handle is ever selected from arcade_players: the player id and token hash
// never leave the database. The id is compared in SQL to produce isYou.
const READ_BOARD = `SELECT r.rank::int AS rank, p.handle, r.score, r.detail,
    r.achieved_at AS "achievedAt", COALESCE(p.id = $3::uuid, false) AS "isYou"
  FROM (${RANKED_ROWS}) r
  JOIN arcade_players p ON p.id = r.player_id
  ORDER BY r.rank ASC, p.id ASC
  LIMIT $4`;

const READ_YOU = `SELECT r.rank::int AS rank, r.score
  FROM (${RANKED_ROWS}) r
  WHERE r.player_id = $3`;

/** The top of one board, plus the caller's own rank when `playerId` is given. */
export async function readBoard(
  pool: Pick<Pool, "query">,
  input: { game: ArcadeGameSlug; board: string; playerId: string | null },
): Promise<{ entries: ArcadeBoardRow[]; you: ArcadeYouRow | null }> {
  const [boardResult, youResult] = await Promise.all([
    pool.query(READ_BOARD, [input.game, input.board, input.playerId, BOARD_LIMIT]),
    input.playerId === null
      ? null
      : pool.query(READ_YOU, [input.game, input.board, input.playerId]),
  ]);
  const entries = arcadeBoardRowSchema.array().parse(boardResult.rows);
  const youRow = youResult?.rows[0];
  return { entries, you: youRow === undefined ? null : arcadeYouRowSchema.parse(youRow) };
}
