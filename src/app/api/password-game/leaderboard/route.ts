import { NextResponse } from "next/server";
import { createLeaderboardStore } from "@/lib/leaderboard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Entry {
  name: string;
  seed: number;
  time: number;
  rules: number;
  createdAt: string;
}

function isEntry(x: unknown): x is Entry {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    typeof o.seed === "number" &&
    typeof o.time === "number" &&
    typeof o.rules === "number" &&
    typeof o.createdAt === "string"
  );
}

const store = createLeaderboardStore<Entry>({
  dataDirEnv: "PG_LEADERBOARD_DIR",
  fileName: "password-game-leaderboard.json",
  maxEntries: 500,
  returnLimit: 50,
  nameMax: 16,
  defaultName: "Anonymous",
  isEntry,
});

const TIME_MAX = 24 * 3600;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const seedParam = searchParams.get("seed");
  const all = await store.readAll();
  const filtered = seedParam != null
    ? all.filter((e) => e.seed === Number(seedParam))
    : all;
  filtered.sort((a, b) => a.time - b.time);
  return NextResponse.json(
    { entries: filtered.slice(0, store.returnLimit) },
    { headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate=30" } },
  );
}

export async function POST(req: Request) {
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
  const seed = typeof o.seed === "number" ? Math.floor(o.seed) : NaN;
  const time = typeof o.time === "number" ? Math.floor(o.time) : NaN;
  const rules = typeof o.rules === "number" ? Math.floor(o.rules) : NaN;

  if (!Number.isFinite(seed) || seed < 0 || seed > 0xffffffff) {
    return NextResponse.json({ error: "invalid seed" }, { status: 400 });
  }
  if (!Number.isFinite(time) || time < 1 || time > TIME_MAX) {
    return NextResponse.json({ error: "invalid time" }, { status: 400 });
  }
  if (!Number.isFinite(rules) || rules < 1 || rules > 100) {
    return NextResponse.json({ error: "invalid rules" }, { status: 400 });
  }

  const entry: Entry = {
    name: store.sanitizeName(o.name),
    seed,
    time,
    rules,
    createdAt: new Date().toISOString(),
  };

  const rank = await store.withWriteLock(async () => {
    const all = await store.readAll();
    all.push(entry);
    all.sort((a, b) => a.time - b.time);
    const trimmed = all.slice(0, store.maxEntries);
    await store.writeAll(trimmed);
    return trimmed.indexOf(entry) + 1;
  });
  return NextResponse.json({ ok: true, rank });
}
