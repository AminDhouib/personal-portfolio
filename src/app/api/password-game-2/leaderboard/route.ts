import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/arcade/tx";
import { getPool } from "@/lib/db";
import { sanitizePlayerName } from "@/lib/player-name";
import {
  MAX_ENTRIES_PER_SEED,
  PG2_SCHEMA_STATEMENTS,
  SEED_MAX,
  TIME_MS_MAX,
  TIME_MS_MIN,
  acceptedDailySeeds,
  enforceTotalCap,
  isAcceptedDailySeed,
  parseSeedParam,
} from "@/lib/pg2-leaderboard";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { guardedJsonRoute } from "@/lib/route-guard";
import { captureException } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETURN_LIMIT = 50;
const NAME_MAX = 16;

/**
 * Arbitrary constant, unique to this table, that serializes writers with a transaction-scoped
 * advisory lock (the arcade ensure uses ...201). Without it two concurrent trims can delete
 * overlapping rows in opposite order and deadlock; writes are capped at 10 a minute per IP, so
 * serializing them costs nothing.
 */
const PG2_WRITE_LOCK_ID = 7_300_100_202;

type Pool = ReturnType<typeof getPool>;

// Prod's Postgres volume was initialized before this table existed, so
// db/init.sql does NOT run there and will not create pg2_leaderboard_entries.
// This repo's compose deploy has no migration runner, so the sanctioned
// pattern is a runtime ensure: run the same CREATE TABLE IF NOT EXISTS + indexes
// exactly once per process, before the first query, awaited by both handlers.
// On fresh volumes init.sql already created them, so this is a harmless no-op.
// The statements live in @/lib/pg2-leaderboard and db/init.sql mirrors them (a test pins it).
let ensured: Promise<void> | null = null;

function ensureTable(pool: Pool): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      for (const statement of PG2_SCHEMA_STATEMENTS) {
        await pool.query(statement);
      }
    })().catch((err) => {
      // Let a later request retry rather than caching a rejected promise forever.
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

const SELECT_COLUMNS = `name, seed, time_ms AS "timeMs", daily, created_at AS "createdAt"`;

const pg2BodySchema = z.object({
  seed: z.unknown(),
  timeMs: z.unknown(),
  daily: z.unknown(),
  name: z.unknown(),
});

export async function GET(req: Request) {
  // Reads stay open to any origin (the response is CDN-cacheable and holds nothing secret), but
  // each one is a top-N sort on a pool of 5, so one client is capped. Checked before any parsing
  // or database work.
  const rate = checkRateLimit(`pg2-leaderboard-read:${getClientIp(req)}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "too many requests" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const { searchParams } = new URL(req.url);
  const seedParam = searchParams.get("seed");
  const dailyParam = searchParams.get("daily");
  // A malformed seed is a client error: answer 400 here instead of letting Postgres reject the
  // bigint cast (a 500 plus a captureException for something the caller got wrong).
  const seedFilter = seedParam === null ? null : parseSeedParam(seedParam);
  if (seedParam !== null && seedFilter === null) {
    return NextResponse.json({ error: "invalid seed" }, { status: 400 });
  }
  try {
    const pool = getPool();
    await ensureTable(pool);

    let rows: Array<Record<string, unknown>>;
    if (seedFilter !== null) {
      const result = await pool.query(
        `SELECT ${SELECT_COLUMNS}
           FROM pg2_leaderboard_entries
          WHERE seed = $1
          ORDER BY time_ms ASC
          LIMIT $2`,
        [seedFilter, RETURN_LIMIT],
      );
      rows = result.rows;
    } else if (dailyParam === "1") {
      // Pinned to the server's own daily seeds (today's, plus yesterday's inside the grace window
      // so a run that started before midnight still lists): a forged daily=TRUE row on another
      // seed never lists, and the seed match lets (seed, time_ms) serve the read.
      const result = await pool.query(
        `SELECT ${SELECT_COLUMNS}
           FROM pg2_leaderboard_entries
          WHERE daily = TRUE AND seed = ANY($1::bigint[])
            AND (created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
          ORDER BY time_ms ASC
          LIMIT $2`,
        [acceptedDailySeeds(), RETURN_LIMIT],
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        `SELECT ${SELECT_COLUMNS}
           FROM pg2_leaderboard_entries
          ORDER BY time_ms ASC, id ASC
          LIMIT $1`,
        [RETURN_LIMIT],
      );
      rows = result.rows;
    }

    return NextResponse.json(
      { entries: rows },
      { headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate=30" } },
    );
  } catch (err) {
    captureException("api:pg2-leaderboard.read", err);
    return NextResponse.json({ error: "could not read leaderboard" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const guard = await guardedJsonRoute(req, {
    key: "pg2-leaderboard",
    limit: 10,
    windowMs: 60_000,
  });
  if (!guard.ok) return guard.response;
  const parsed = pg2BodySchema.safeParse(guard.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const o = parsed.data;
  const seed = typeof o.seed === "number" ? o.seed : NaN;
  const timeMs = typeof o.timeMs === "number" ? Math.floor(o.timeMs) : NaN;
  // Accept only a strict boolean true as daily; anything else defaults to false.
  const daily = o.daily === true;

  if (!Number.isInteger(seed) || seed < 0 || seed > SEED_MAX) {
    return NextResponse.json({ error: "invalid seed" }, { status: 400 });
  }
  if (!Number.isFinite(timeMs) || timeMs < TIME_MS_MIN || timeMs > TIME_MS_MAX) {
    return NextResponse.json({ error: "invalid timeMs" }, { status: 400 });
  }
  // A daily run must be on the server's own daily seed, so the daily board cannot be seeded with
  // arbitrary rows. This is a consistency check, not anti-cheat: the board stays display-only.
  if (daily && !isAcceptedDailySeed(seed)) {
    return NextResponse.json({ error: "not the daily seed" }, { status: 400 });
  }

  const name = sanitizePlayerName(o.name, { maxLength: NAME_MAX, fallback: "Anonymous" });

  try {
    const pool = getPool();
    await ensureTable(pool);

    // One transaction: the insert and both trims land together or not at all, and the advisory
    // lock keeps concurrent writers from interleaving their deletes.
    const outcome = await withTransaction(pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock($1)", [PG2_WRITE_LOCK_ID]);

      const inserted = await client.query(
        `INSERT INTO pg2_leaderboard_entries (name, seed, time_ms, daily)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [name, seed, timeMs, daily],
      );
      const insertedId = inserted.rows[0].id as number;

      // Rank is position within the same seed: how many runs of this seed are
      // strictly faster, plus one.
      const { rows: rankRows } = await client.query(
        `SELECT COUNT(*) + 1 AS rank
           FROM pg2_leaderboard_entries
          WHERE seed = $1 AND time_ms < $2`,
        [seed, timeMs],
      );

      // Trim to the fastest N PER SEED — delete only rows of this seed that fall
      // outside its own top N, leaving every other seed's board untouched.
      await client.query(
        `DELETE FROM pg2_leaderboard_entries
          WHERE seed = $1
            AND id NOT IN (
              SELECT id FROM pg2_leaderboard_entries
               WHERE seed = $1
               ORDER BY time_ms ASC, id ASC
               LIMIT $2
            )`,
        [seed, MAX_ENTRIES_PER_SEED],
      );

      // Whole-table cap (see enforceTotalCap): a seed is any 32-bit integer, so the per-seed trim
      // alone does not bound the table. A no-op, after one cheap probe, while under the cap.
      await enforceTotalCap(client);

      // The run may not have survived: the per-seed trim drops it when 500 faster runs share
      // its seed. Say so instead of reporting a rank for a row that is gone.
      const kept = await client.query(
        `SELECT 1 FROM pg2_leaderboard_entries
          WHERE id = $1`,
        [insertedId],
      );
      return kept.rows.length > 0
        ? { stored: true as const, rank: Number(rankRows[0].rank) }
        : { stored: false as const };
    });

    if (!outcome.stored) return NextResponse.json({ ok: true, stored: false });
    return NextResponse.json({ ok: true, stored: true, rank: outcome.rank });
  } catch (err) {
    captureException("api:pg2-leaderboard.write", err);
    return NextResponse.json({ error: "could not save score" }, { status: 500 });
  }
}
