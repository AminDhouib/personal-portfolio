import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { sanitizePlayerName } from "@/lib/player-name";
import { guardedJsonRoute } from "@/lib/route-guard";
import { captureException } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ENTRIES = 500;
const RETURN_LIMIT = 50;
const NAME_MAX = 16;

const pgBodySchema = z.object({
  seed: z.unknown(),
  elapsedSeconds: z.unknown(),
  ruleCount: z.unknown(),
  name: z.unknown(),
});

const ELAPSED_SECONDS_MAX = 24 * 3600;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const seedParam = searchParams.get("seed");
  try {
    const pool = getPool();
    const { rows } =
      seedParam !== null
        ? await pool.query(
            `SELECT name, seed, elapsed_seconds AS "elapsedSeconds",
                  rule_count AS "ruleCount", created_at AS "createdAt"
             FROM pg_leaderboard_entries
            WHERE seed = $1
            ORDER BY elapsed_seconds ASC
            LIMIT $2`,
            [Number(seedParam), RETURN_LIMIT],
          )
        : await pool.query(
            `SELECT name, seed, elapsed_seconds AS "elapsedSeconds",
                  rule_count AS "ruleCount", created_at AS "createdAt"
             FROM pg_leaderboard_entries
            ORDER BY elapsed_seconds ASC
            LIMIT $1`,
            [RETURN_LIMIT],
          );
    return NextResponse.json(
      { entries: rows },
      { headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate=30" } },
    );
  } catch (err) {
    captureException("api:pg-leaderboard.read", err);
    return NextResponse.json({ error: "could not read leaderboard" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const guard = await guardedJsonRoute(req, {
    key: "pg-leaderboard",
    limit: 10,
    windowMs: 60_000,
  });
  if (!guard.ok) return guard.response;
  const parsed = pgBodySchema.safeParse(guard.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const o = parsed.data;
  const seed = typeof o.seed === "number" ? Math.floor(o.seed) : NaN;
  const elapsedSeconds = typeof o.elapsedSeconds === "number" ? Math.floor(o.elapsedSeconds) : NaN;
  const ruleCount = typeof o.ruleCount === "number" ? Math.floor(o.ruleCount) : NaN;

  if (!Number.isFinite(seed) || seed < 0 || seed > 0xffffffff) {
    return NextResponse.json({ error: "invalid seed" }, { status: 400 });
  }
  if (
    !Number.isFinite(elapsedSeconds) ||
    elapsedSeconds < 1 ||
    elapsedSeconds > ELAPSED_SECONDS_MAX
  ) {
    return NextResponse.json({ error: "invalid elapsedSeconds" }, { status: 400 });
  }
  if (!Number.isFinite(ruleCount) || ruleCount < 1 || ruleCount > 100) {
    return NextResponse.json({ error: "invalid ruleCount" }, { status: 400 });
  }

  const name = sanitizePlayerName(o.name, { maxLength: NAME_MAX, fallback: "Anonymous" });

  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO pg_leaderboard_entries (name, seed, elapsed_seconds, rule_count)
       VALUES ($1, $2, $3, $4)`,
      [name, seed, elapsedSeconds, ruleCount],
    );

    const { rows: rankRows } = await pool.query(
      `SELECT COUNT(*) + 1 AS rank
         FROM pg_leaderboard_entries
        WHERE elapsed_seconds < $1`,
      [elapsedSeconds],
    );
    const rank = Number(rankRows[0].rank);

    // Trim to MAX_ENTRIES: keep only the fastest N.
    await pool.query(
      `DELETE FROM pg_leaderboard_entries
        WHERE id NOT IN (
          SELECT id FROM pg_leaderboard_entries
           ORDER BY elapsed_seconds ASC
           LIMIT $1
        )`,
      [MAX_ENTRIES],
    );

    return NextResponse.json({ ok: true, rank });
  } catch (err) {
    captureException("api:pg-leaderboard.write", err);
    return NextResponse.json({ error: "could not save score" }, { status: 500 });
  }
}
