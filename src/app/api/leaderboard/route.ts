import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

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

const DATA_DIR = process.env.LEADERBOARD_DATA_DIR ?? path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "leaderboard.json");
const MAX_ENTRIES = 100;
const RETURN_LIMIT = 25;
const NAME_MAX = 12;
const SCORE_CAP = 10_000_000;

async function readAll(): Promise<Entry[]> {
  try {
    const buf = await fs.readFile(FILE, "utf-8");
    const parsed = JSON.parse(buf);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    return [];
  }
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

async function writeAll(entries: Entry[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  // tmp filename includes pid + a counter so concurrent writers don't clobber
  // each other's tmp file before rename.
  const tmp = `${FILE}.tmp-${process.pid}-${nextTmp()}`;
  await fs.writeFile(tmp, JSON.stringify(entries), "utf-8");
  await fs.rename(tmp, FILE);
}

let tmpCounter = 0;
function nextTmp(): number {
  tmpCounter = (tmpCounter + 1) % 1_000_000;
  return tmpCounter;
}

// In-process serialization — concurrent POSTs to the same dyno would otherwise
// race read → modify → write and one would lose. Real DB would handle this.
let writeChain: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => undefined);
  return next;
}

function sanitizeGame(raw: unknown): string {
  if (typeof raw !== "string") return "space-shooter";
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  return cleaned.length > 0 ? cleaned : "space-shooter";
}

function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "Pilot";
  const cleaned = raw.replace(/[\u0000-\u001f]/g, "").trim().slice(0, NAME_MAX);
  return cleaned.length > 0 ? cleaned : "Pilot";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const game = url.searchParams.get("game");
  let entries = await readAll();
  if (game) {
    entries = entries.filter((e) => (e.game ?? "space-shooter") === game);
  } else {
    entries = entries.filter((e) => (e.game ?? "space-shooter") === "space-shooter");
  }
  entries.sort((a, b) => b.score - a.score);
  return NextResponse.json({ entries: entries.slice(0, RETURN_LIMIT) });
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
  const score = typeof o.score === "number" ? Math.floor(o.score) : NaN;
  const level = typeof o.level === "number" ? Math.floor(o.level) : NaN;
  if (!Number.isFinite(score) || score < 0 || score > SCORE_CAP) {
    return NextResponse.json({ error: "invalid score" }, { status: 400 });
  }
  if (!Number.isFinite(level) || level < 1 || level > 1000) {
    return NextResponse.json({ error: "invalid level" }, { status: 400 });
  }
  const entry: Entry = {
    name: sanitizeName(o.name),
    score,
    level,
    seconds: typeof o.seconds === "number" && o.seconds >= 0 && o.seconds < 24 * 3600
      ? Math.floor(o.seconds) : undefined,
    kills: typeof o.kills === "number" && o.kills >= 0 && o.kills < 100_000
      ? Math.floor(o.kills) : undefined,
    distance: typeof o.distance === "number" && o.distance >= 0 && o.distance < 1_000_000
      ? Math.floor(o.distance) : undefined,
    region: typeof o.region === "string" && o.region.length > 0 && o.region.length <= 60
      ? o.region.replace(/[\u0000-\u001f]/g, "").slice(0, 60) : undefined,
    game: sanitizeGame(o.game),
    createdAt: new Date().toISOString(),
  };
  const rank = await withWriteLock(async () => {
    const all = await readAll();
    all.push(entry);
    all.sort((a, b) => b.score - a.score);
    // Per-game cap: keep top MAX_ENTRIES per game
    const byGame = new Map<string, Entry[]>();
    for (const e of all) {
      const key = e.game ?? "space-shooter";
      if (!byGame.has(key)) byGame.set(key, []);
      byGame.get(key)!.push(e);
    }
    const trimmed: Entry[] = [];
    for (const [, list] of byGame) trimmed.push(...list.slice(0, MAX_ENTRIES));
    trimmed.sort((a, b) => b.score - a.score);
    await writeAll(trimmed);
    const gameList = byGame.get(entry.game ?? "space-shooter") ?? [];
    return gameList.indexOf(entry) + 1;
  });
  return NextResponse.json({ ok: true, rank });
}
