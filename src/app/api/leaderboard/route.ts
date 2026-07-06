import { NextResponse } from "next/server";
import { createLeaderboardStore } from "@/lib/leaderboard-store";
import { checkRateLimit, getClientIp, isSameOrigin } from "@/lib/rate-limit";

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
  dataDirEnv: "LEADERBOARD_DATA_DIR",
  fileName: "leaderboard.json",
  maxEntries: 100,
  returnLimit: 25,
  nameMax: 12,
  defaultName: "Pilot",
  isEntry,
});

const SCORE_CAP = 10_000_000;

function sanitizeGame(raw: unknown): string {
  if (typeof raw !== "string") return "space-shooter";
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);
  return cleaned.length > 0 ? cleaned : "space-shooter";
}

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
    game: sanitizeGame(o.game),
    createdAt: new Date().toISOString(),
  };
  const rank = await store.withWriteLock(async () => {
    const all = await store.readAll();
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
  return NextResponse.json({ ok: true, rank });
}
