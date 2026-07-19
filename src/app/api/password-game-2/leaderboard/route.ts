import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { sanitizePlayerName } from "@/lib/player-name";
import { guardedJsonRoute } from "@/lib/route-guard";
import { captureException } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ENTRIES_PER_SEED = 500;
const RETURN_LIMIT = 50;
const NAME_MAX = 16;

const SEED_MAX = 0xffffffff; // 2^32 - 1
const TIME_MS_MIN = 10_000; // 10s floor — a full run cannot be faster
const TIME_MS_MAX = 3_600_000; // 1h ceiling

type Pool = ReturnType<typeof getPool>;

// Prod's Postgres volume was initialized before this table existed, so
// db/init.sql does NOT run there and will not create pg2_leaderboard_entries.
// This repo's compose deploy has no migration runner, so the sanctioned
// pattern is a runtime ensure: run the same CREATE TABLE IF NOT EXISTS + index
// exactly once per process, before the first query, awaited by both handlers.
// On fresh volumes init.sql already created it, so this is a harmless no-op.
let ensured: Promise<void> | null = null;

function ensureTable(pool: Pool): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS pg2_leaderboard_entries (
           id              SERIAL PRIMARY KEY,
           name            TEXT        NOT NULL,
           seed            BIGINT      NOT NULL,
           time_ms         INTEGER     NOT NULL,
           daily           BOOLEAN     NOT NULL DEFAULT FALSE,
           created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
         )`,
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_pg2_leaderboard_seed_time
           ON pg2_leaderboard_entries (seed, time_ms ASC)`,
      );
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
  const { searchParams } = new URL(req.url);
  const seedParam = searchParams.get("seed");
  const dailyParam = searchParams.get("daily");
  try {
    const pool = getPool();
    await ensureTable(pool);

    let rows: Array<Record<string, unknown>>;
    if (seedParam !== null) {
      const result = await pool.query(
        `SELECT ${SELECT_COLUMNS}
           FROM pg2_leaderboard_entries
          WHERE seed = $1
          ORDER BY time_ms ASC
          LIMIT $2`,
        [Number(seedParam), RETURN_LIMIT],
      );
      rows = result.rows;
    } else if (dailyParam === "1") {
      const result = await pool.query(
        `SELECT ${SELECT_COLUMNS}
           FROM pg2_leaderboard_entries
          WHERE daily = TRUE AND created_at::date = now()::date
          ORDER BY time_ms ASC
          LIMIT $1`,
        [RETURN_LIMIT],
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        `SELECT ${SELECT_COLUMNS}
           FROM pg2_leaderboard_entries
          ORDER BY time_ms ASC
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
  const seed = typeof o.seed === "number" ? Math.floor(o.seed) : NaN;
  const timeMs = typeof o.timeMs === "number" ? Math.floor(o.timeMs) : NaN;
  // Accept only a strict boolean true as daily; anything else defaults to false.
  const daily = o.daily === true;

  if (!Number.isFinite(seed) || seed < 0 || seed > SEED_MAX) {
    return NextResponse.json({ error: "invalid seed" }, { status: 400 });
  }
  if (!Number.isFinite(timeMs) || timeMs < TIME_MS_MIN || timeMs > TIME_MS_MAX) {
    return NextResponse.json({ error: "invalid timeMs" }, { status: 400 });
  }

  const name = sanitizePlayerName(o.name, { maxLength: NAME_MAX, fallback: "Anonymous" });

  try {
    const pool = getPool();
    await ensureTable(pool);

    await pool.query(
      `INSERT INTO pg2_leaderboard_entries (name, seed, time_ms, daily)
       VALUES ($1, $2, $3, $4)`,
      [name, seed, timeMs, daily],
    );

    // Rank is position within the same seed: how many runs of this seed are
    // strictly faster, plus one.
    const { rows: rankRows } = await pool.query(
      `SELECT COUNT(*) + 1 AS rank
         FROM pg2_leaderboard_entries
        WHERE seed = $1 AND time_ms < $2`,
      [seed, timeMs],
    );
    const rank = Number(rankRows[0].rank);

    // Trim to the fastest N PER SEED — delete only rows of this seed that fall
    // outside its own top N, leaving every other seed's board untouched.
    await pool.query(
      `DELETE FROM pg2_leaderboard_entries
        WHERE seed = $1
          AND id NOT IN (
            SELECT id FROM pg2_leaderboard_entries
             WHERE seed = $1
             ORDER BY time_ms ASC
             LIMIT $2
          )`,
      [seed, MAX_ENTRIES_PER_SEED],
    );

    return NextResponse.json({ ok: true, rank });
  } catch (err) {
    captureException("api:pg2-leaderboard.write", err);
    return NextResponse.json({ error: "could not save score" }, { status: 500 });
  }
}
