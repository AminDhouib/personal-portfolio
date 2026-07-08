import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { sanitizePlayerName } from "@/lib/player-name";
import { LEADERBOARD_GAMES } from "@/lib/leaderboard-games";
import { guardedJsonRoute } from "@/lib/route-guard";
import { captureException } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ENTRIES_PER_GAME = 100;
const RETURN_LIMIT = 25;
const NAME_MAX = 12;
const SCORE_CAP = 10_000_000;

const gameSchema = z.enum(LEADERBOARD_GAMES);

// Control chars written as unicode escapes, never literal bytes (pass-1
// Control-char sanitizer built from char codes so the source file stays
// free of literal control bytes (pass-1 incident ae32d5c).
const CONTROL_CHARS = new RegExp(
  "[" +
    String.fromCharCode(0) +
    "-" +
    String.fromCharCode(0x1f) +
    String.fromCharCode(0x7f) +
    "-" +
    String.fromCharCode(0x9f) +
    "]",
  "g",
);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const game = url.searchParams.get("game");
  if (!game) {
    return NextResponse.json({ error: "missing game" }, { status: 400 });
  }
  try {
    const { rows } = await getPool().query(
      `SELECT name, score, level, seconds, kills, distance, region,
              created_at AS "createdAt"
         FROM leaderboard_entries
        WHERE game = $1
        ORDER BY score DESC
        LIMIT $2`,
      [game, RETURN_LIMIT],
    );
    return NextResponse.json(
      { entries: rows },
      { headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate=30" } },
    );
  } catch (err) {
    captureException("api:leaderboard.read", err);
    return NextResponse.json({ error: "could not read leaderboard" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const guard = await guardedJsonRoute(req, { key: "leaderboard", limit: 10, windowMs: 60_000 });
  if (!guard.ok) return guard.response;
  if (!guard.body || typeof guard.body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const o = guard.body as Record<string, unknown>;
  const score = typeof o.score === "number" ? Math.floor(o.score) : NaN;
  const level = typeof o.level === "number" ? Math.floor(o.level) : NaN;
  if (!Number.isFinite(score) || score < 0 || score > SCORE_CAP) {
    return NextResponse.json({ error: "invalid score" }, { status: 400 });
  }
  if (!Number.isFinite(level) || level < 1 || level > 1000) {
    return NextResponse.json({ error: "invalid level" }, { status: 400 });
  }
  const parsedGame = gameSchema.safeParse(o.game);
  if (!parsedGame.success) {
    return NextResponse.json({ error: "invalid game" }, { status: 400 });
  }
  const game = parsedGame.data;
  const name = sanitizePlayerName(o.name, { maxLength: NAME_MAX, fallback: "Pilot" });
  const seconds =
    typeof o.seconds === "number" && o.seconds >= 0 && o.seconds < 24 * 3600
      ? Math.floor(o.seconds)
      : null;
  const kills =
    typeof o.kills === "number" && o.kills >= 0 && o.kills < 100_000 ? Math.floor(o.kills) : null;
  const distance =
    typeof o.distance === "number" && o.distance >= 0 && o.distance < 1_000_000
      ? Math.floor(o.distance)
      : null;
  const region =
    typeof o.region === "string" && o.region.length > 0 && o.region.length <= 60
      ? o.region.replace(CONTROL_CHARS, "").slice(0, 60)
      : null;

  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO leaderboard_entries (game, name, score, level, seconds, kills, distance, region)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [game, name, score, level, seconds, kills, distance, region],
    );

    const { rows: rankRows } = await pool.query(
      `SELECT COUNT(*) + 1 AS rank
         FROM leaderboard_entries
        WHERE game = $1 AND score > $2`,
      [game, score],
    );
    const rank = Number(rankRows[0].rank);

    // Trim to MAX_ENTRIES_PER_GAME: keep only the top N by score.
    await pool.query(
      `DELETE FROM leaderboard_entries
        WHERE game = $1
          AND id NOT IN (
            SELECT id FROM leaderboard_entries
             WHERE game = $1
             ORDER BY score DESC
             LIMIT $2
          )`,
      [game, MAX_ENTRIES_PER_GAME],
    );

    return NextResponse.json({ ok: true, rank });
  } catch (err) {
    captureException("api:leaderboard.write", err);
    return NextResponse.json({ error: "could not save score" }, { status: 500 });
  }
}
