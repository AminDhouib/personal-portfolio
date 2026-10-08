import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { captureException } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only archive of the frozen leaderboard_entries rows (Orbital Dodge, Hextris and
// the classic Tower Stacker). Every game that wrote here now uses /api/arcade/scores, so
// this route has no writer and the table is never dropped (DESIGN.md "Arcade backend").
const RETURN_LIMIT = 25;

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
