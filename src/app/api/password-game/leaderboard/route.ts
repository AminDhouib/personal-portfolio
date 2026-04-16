import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Entry {
  name: string;
  seed: number;
  time: number;        // seconds
  rules: number;       // total rules cleared
  createdAt: string;
}

const DATA_DIR = process.env.PG_LEADERBOARD_DIR ?? path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "password-game-leaderboard.json");
const MAX_ENTRIES = 500;
const RETURN_LIMIT = 50;
const NAME_MAX = 16;
const TIME_MAX = 24 * 3600; // 1 day in seconds — anything over is invalid

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
    typeof o.seed === "number" &&
    typeof o.time === "number" &&
    typeof o.rules === "number" &&
    typeof o.createdAt === "string"
  );
}

async function writeAll(entries: Entry[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp-${process.pid}-${nextTmp()}`;
  await fs.writeFile(tmp, JSON.stringify(entries), "utf-8");
  await fs.rename(tmp, FILE);
}

let tmpCounter = 0;
function nextTmp(): number {
  tmpCounter = (tmpCounter + 1) % 1_000_000;
  return tmpCounter;
}

let writeChain: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => undefined);
  return next;
}

function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "Anonymous";
  const cleaned = raw.replace(/[\u0000-\u001f]/g, "").trim().slice(0, NAME_MAX);
  return cleaned.length > 0 ? cleaned : "Anonymous";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const seedParam = searchParams.get("seed");
  const all = await readAll();
  const filtered = seedParam != null
    ? all.filter((e) => e.seed === Number(seedParam))
    : all;
  filtered.sort((a, b) => a.time - b.time);
  return NextResponse.json({ entries: filtered.slice(0, RETURN_LIMIT) });
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
    name: sanitizeName(o.name),
    seed,
    time,
    rules,
    createdAt: new Date().toISOString(),
  };

  const rank = await withWriteLock(async () => {
    const all = await readAll();
    all.push(entry);
    all.sort((a, b) => a.time - b.time);
    const trimmed = all.slice(0, MAX_ENTRIES);
    await writeAll(trimmed);
    return trimmed.indexOf(entry) + 1;
  });
  return NextResponse.json({ ok: true, rank });
}
