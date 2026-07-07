import { NextResponse } from "next/server";
import { z } from "zod";
import { createLeaderboardStore, LeaderboardCorruptError } from "@/lib/leaderboard-store";
import { leaderboardEntrySchema, type LeaderboardEntry } from "@/lib/persistence-schemas";
import { LEADERBOARD_GAMES } from "@/lib/leaderboard-games";
import { guardedJsonRoute } from "@/lib/route-guard";
import { captureException } from "@/lib/log";
import { env } from "@/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Entry = LeaderboardEntry;

function isEntry(x: unknown): x is Entry {
  return leaderboardEntrySchema.safeParse(x).success;
}

const store = createLeaderboardStore<Entry>({
  dataDir: env.LEADERBOARD_DATA_DIR,
  fileName: "leaderboard.json",
  maxEntries: 100,
  returnLimit: 25,
  nameMax: 12,
  defaultName: "Pilot",
  isEntry,
});

const SCORE_CAP = 10_000_000;

// RC-1 / DD1-001 fix: a missing/invalid `game` is now REJECTED (400), not
// silently bucketed into "space-shooter". All three in-repo clients
// (space-shooter, hextris, tower-stacker) migrated to send a valid `game` in
// P2 steps 3-5 before this flip landed, so there is no live traffic that
// relied on the old silent default. A closed enum (not "any non-empty
// string") is deliberate: a client typo would otherwise create a new silent
// junk bucket, reopening a narrower version of the same bug this fixes.
const gameSchema = z.enum(LEADERBOARD_GAMES);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const game = url.searchParams.get("game");
  // Decision 1 (P2 plan gate): require ?game= for a consistent no-silent-
  // default contract, matching the POST-side reject. Deliberately NOT
  // enum-validated here: an unknown slug just filters to [] (harmless), so
  // a future 4th game or a stale client requesting an old slug never 400s
  // on read -- only a genuinely missing `game` is an error.
  if (!game) {
    return NextResponse.json({ error: "missing game" }, { status: 400 });
  }
  let entries = await store.readAll();
  entries = entries.filter((e) => (e.game ?? "space-shooter") === game);
  entries.sort((a, b) => b.score - a.score);
  return NextResponse.json(
    { entries: entries.slice(0, store.returnLimit) },
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
  const entry: Entry = {
    name: store.sanitizeName(o.name),
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
      typeof o.region === "string" && o.region.length > 0 && o.region.length <= 60
        ? o.region.replace(/[\u0000-\u001f]/g, "").slice(0, 60)
        : undefined,
    game: parsedGame.data,
    createdAt: new Date().toISOString(),
  };
  let rank: number;
  try {
    rank = await store.withWriteLock(async () => {
      const all = await store.readForUpdate();
      all.push(entry);
      all.sort((a, b) => b.score - a.score);
      const byGame = new Map<string, Entry[]>();
      for (const e of all) {
        const key = e.game ?? "space-shooter";
        if (!byGame.has(key)) byGame.set(key, []);
        byGame.get(key)!.push(e);
      }
      const trimmed: Entry[] = [];
      for (const [, list] of byGame) trimmed.push(...list.slice(0, store.maxEntries));
      trimmed.sort((a, b) => b.score - a.score);
      await store.writeAll(trimmed);
      const gameList = byGame.get(entry.game ?? "space-shooter") ?? [];
      return gameList.indexOf(entry) + 1;
    });
  } catch (err) {
    captureException("api:leaderboard.write", err);
    const status = err instanceof LeaderboardCorruptError ? 503 : 500;
    return NextResponse.json(
      { error: status === 503 ? "leaderboard temporarily unavailable" : "could not save score" },
      { status },
    );
  }
  return NextResponse.json({ ok: true, rank });
}
