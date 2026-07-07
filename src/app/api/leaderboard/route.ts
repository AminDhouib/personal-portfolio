import { NextResponse } from "next/server";
import { z } from "zod";
import { createLeaderboardStore, LeaderboardCorruptError } from "@/lib/leaderboard-store";
import { checkRateLimit, getClientIp, isSameOrigin } from "@/lib/rate-limit";
import { captureException, logWarn } from "@/lib/log";
import { env } from "@/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Entry {
  name: string;
  score: number;
  level: number;
  seconds?: number;
  kills?: number;
  distance?: number;
  region?: string;
  game?: string;
  createdAt: string;
}

function isEntry(x: unknown): x is Entry {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    typeof o.score === "number" &&
    typeof o.level === "number" &&
    typeof o.createdAt === "string"
  );
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

// DD1-001, PRESERVED ON PURPOSE. A missing / non-string / empty `game` silently
// buckets into "space-shooter". The legacy space-shooter and hextris clients send
// no `game` field at all, so this default is the COMMON path, not a rare one --
// which is exactly the bug (their scores share one board). The real fix
// (reject-or-require `game`) is refactor batch P2, sequenced under P1's pinning
// tests; doing it here would change routing on an untested path. Routing is left
// identical, but every bucket is now made LOUD via logWarn so DD1-001's true
// frequency is visible in logs. (logWarn, not captureException: an $exception per
// submit would flood the tracker since the bucket path fires on normal traffic.)
const gameSchema = z.unknown().transform((raw): string => {
  if (typeof raw === "string") {
    const cleaned = raw
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 40);
    if (cleaned.length > 0) return cleaned;
  }
  logWarn("api:leaderboard", "game missing/invalid; bucketed to space-shooter (DD1-001)", raw);
  return "space-shooter";
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const game = url.searchParams.get("game");
  let entries = await store.readAll();
  if (game) {
    entries = entries.filter((e) => (e.game ?? "space-shooter") === game);
  } else {
    entries = entries.filter((e) => (e.game ?? "space-shooter") === "space-shooter");
  }
  entries.sort((a, b) => b.score - a.score);
  return NextResponse.json(
    { entries: entries.slice(0, store.returnLimit) },
    { headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate=30" } },
  );
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const rate = checkRateLimit(`leaderboard:${getClientIp(req)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "too many requests" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // silent-ok: a malformed request body is a client error, surfaced as the 400 below
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const score = typeof o.score === "number" ? Math.floor(o.score) : NaN;
  const level = typeof o.level === "number" ? Math.floor(o.level) : NaN;
  if (!Number.isFinite(score) || score < 0 || score > SCORE_CAP) {
    return NextResponse.json({ error: "invalid score" }, { status: 400 });
  }
  if (!Number.isFinite(level) || level < 1 || level > 1000) {
    return NextResponse.json({ error: "invalid level" }, { status: 400 });
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
    game: gameSchema.parse(o.game),
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
