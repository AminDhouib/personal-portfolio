import { NextResponse } from "next/server";
import { z } from "zod";
import { createJsonFileStore, JsonFileCorruptError } from "@/lib/json-file-store";
import {
  emptyGameLeaderboardFile,
  gameLeaderboardFileSchema,
  PERSISTENCE_SCHEMA_VERSION,
  type GameLeaderboardRow,
} from "@/lib/persistence-schemas";
import { sanitizePlayerName } from "@/lib/player-name";
import { LEADERBOARD_GAMES } from "@/lib/leaderboard-games";
import { guardedJsonRoute } from "@/lib/route-guard";
import { captureException } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const store = createJsonFileStore({
  fileName: "leaderboard.json",
  schemaVersion: PERSISTENCE_SCHEMA_VERSION,
  fileSchema: gameLeaderboardFileSchema,
  emptyFile: emptyGameLeaderboardFile,
  scope: "leaderboard",
});

const MAX_ENTRIES_PER_GAME = 100;
const RETURN_LIMIT = 25;
const NAME_MAX = 12;
const SCORE_CAP = 10_000_000;

// RC-1 / DD1-001 fix: a missing/invalid `game` is REJECTED (400), not
// silently bucketed. A closed enum (not "any non-empty string") is
// deliberate: a client typo would otherwise create a new silent junk bucket.
// Since schema v2 the slug is the bucket key in the boards record, so a
// persisted row can no longer disagree with the board it sits in.
const gameSchema = z.enum(LEADERBOARD_GAMES);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const game = url.searchParams.get("game");
  // Decision 1 (P2 plan gate): require ?game= for a consistent no-silent-
  // default contract, matching the POST-side reject. Deliberately NOT
  // enum-validated here: an unknown slug just reads an absent board
  // (harmless []), so a future 4th game or a stale client requesting an old
  // slug never 400s on read -- only a genuinely missing `game` is an error.
  if (!game) {
    return NextResponse.json({ error: "missing game" }, { status: 400 });
  }
  const file = await store.readFile();
  const rows = [...(file.boards[game] ?? [])];
  rows.sort((a, b) => b.score - a.score);
  return NextResponse.json(
    { entries: rows.slice(0, RETURN_LIMIT) },
    { headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate=30" } },
  );
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
  const row: GameLeaderboardRow = {
    name: sanitizePlayerName(o.name, { maxLength: NAME_MAX, fallback: "Pilot" }),
    score,
    level,
    seconds:
      typeof o.seconds === "number" && o.seconds >= 0 && o.seconds < 24 * 3600
        ? Math.floor(o.seconds)
        : undefined,
    kills:
      typeof o.kills === "number" && o.kills >= 0 && o.kills < 100_000
        ? Math.floor(o.kills)
        : undefined,
    distance:
      typeof o.distance === "number" && o.distance >= 0 && o.distance < 1_000_000
        ? Math.floor(o.distance)
        : undefined,
    region:
      // Control chars written as unicode ESCAPES, never literal bytes: a raw
      // NUL inside this class makes grep classify the file as binary (pass-1
      // incident, commit ae32d5c).
      typeof o.region === "string" && o.region.length > 0 && o.region.length <= 60
        ? o.region.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").slice(0, 60)
        : undefined,
    createdAt: new Date().toISOString(),
  };
  let rank: number;
  try {
    rank = await store.withWriteLock(async () => {
      const file = await store.readFileForUpdate();
      const rows = [...(file.boards[game] ?? []), row];
      rows.sort((a, b) => b.score - a.score);
      // Rank reflects the full sorted board BEFORE trimming (v1 contract): a
      // submission that falls off the kept top-N still gets its true rank.
      const rank = rows.indexOf(row) + 1;
      file.boards[game] = rows.slice(0, MAX_ENTRIES_PER_GAME);
      await store.writeFile(file);
      return rank;
    });
  } catch (err) {
    captureException("api:leaderboard.write", err);
    const status = err instanceof JsonFileCorruptError ? 503 : 500;
    return NextResponse.json(
      { error: status === 503 ? "leaderboard temporarily unavailable" : "could not save score" },
      { status },
    );
  }
  return NextResponse.json({ ok: true, rank });
}
