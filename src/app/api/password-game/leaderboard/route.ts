import { NextResponse } from "next/server";
import { z } from "zod";
import { createLeaderboardStore, LeaderboardCorruptError } from "@/lib/leaderboard-store";
import { pgLeaderboardEntrySchema, type PgLeaderboardEntry } from "@/lib/persistence-schemas";
import { guardedJsonRoute } from "@/lib/route-guard";
import { captureException } from "@/lib/log";
import { env } from "@/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Entry = PgLeaderboardEntry;

function isEntry(x: unknown): x is Entry {
  return pgLeaderboardEntrySchema.safeParse(x).success;
}

const store = createLeaderboardStore<Entry>({
  dataDir: env.PG_LEADERBOARD_DIR,
  fileName: "password-game-leaderboard.json",
  maxEntries: 500,
  returnLimit: 50,
  nameMax: 16,
  defaultName: "Anonymous",
  isEntry,
});

const pgBodySchema = z.object({
  seed: z.unknown(),
  time: z.unknown(),
  rules: z.unknown(),
  name: z.unknown(),
});

const TIME_MAX = 24 * 3600;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const seedParam = searchParams.get("seed");
  const all = await store.readAll();
  const filtered = seedParam !== null ? all.filter((e) => e.seed === Number(seedParam)) : all;
  filtered.sort((a, b) => a.time - b.time);
  return NextResponse.json(
    { entries: filtered.slice(0, store.returnLimit) },
    { headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate=30" } },
  );
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

  let rank: number;
  try {
    rank = await store.withWriteLock(async () => {
      const all = await store.readForUpdate();
      all.push(entry);
      all.sort((a, b) => a.time - b.time);
      const trimmed = all.slice(0, store.maxEntries);
      await store.writeAll(trimmed);
      return trimmed.indexOf(entry) + 1;
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
