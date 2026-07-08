import { NextResponse } from "next/server";
import { z } from "zod";
import { createJsonFileStore, JsonFileCorruptError } from "@/lib/json-file-store";
import {
  emptyPasswordGameLeaderboardFile,
  passwordGameLeaderboardFileSchema,
  PERSISTENCE_SCHEMA_VERSION,
  type PasswordGameLeaderboardEntry,
} from "@/lib/persistence-schemas";
import { sanitizePlayerName } from "@/lib/player-name";
import { guardedJsonRoute } from "@/lib/route-guard";
import { captureException } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const store = createJsonFileStore({
  fileName: "password-game-leaderboard.json",
  schemaVersion: PERSISTENCE_SCHEMA_VERSION,
  fileSchema: passwordGameLeaderboardFileSchema,
  emptyFile: emptyPasswordGameLeaderboardFile,
  scope: "pg-leaderboard",
});

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
  const file = await store.readFile();
  const filtered =
    seedParam !== null
      ? file.entries.filter((e) => e.seed === Number(seedParam))
      : [...file.entries];
  filtered.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
  return NextResponse.json(
    { entries: filtered.slice(0, RETURN_LIMIT) },
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

  const entry: PasswordGameLeaderboardEntry = {
    name: sanitizePlayerName(o.name, { maxLength: NAME_MAX, fallback: "Anonymous" }),
    seed,
    elapsedSeconds,
    ruleCount,
    createdAt: new Date().toISOString(),
  };

  let rank: number;
  try {
    rank = await store.withWriteLock(async () => {
      const file = await store.readFileForUpdate();
      const entries = [...file.entries, entry];
      entries.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
      const trimmed = entries.slice(0, MAX_ENTRIES);
      await store.writeFile({ ...file, entries: trimmed });
      return trimmed.indexOf(entry) + 1;
    });
  } catch (err) {
    captureException("api:pg-leaderboard.write", err);
    const status = err instanceof JsonFileCorruptError ? 503 : 500;
    return NextResponse.json(
      { error: status === 503 ? "leaderboard temporarily unavailable" : "could not save score" },
      { status },
    );
  }
  return NextResponse.json({ ok: true, rank });
}
