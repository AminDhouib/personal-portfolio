# Password Game 2: Result Card & Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a player clears all rules, show a shareable result card (seed, time, rules-cleared) and a name-entry form that submits to a dedicated Password Game 2 leaderboard. Add a `/games/password-game/leaderboard` page with top scores filterable by seed.

**Architecture:** Leaderboard follows the same file-based JSON pattern as the existing `/api/leaderboard` route but under `/api/password-game/leaderboard` with a separate data file. Result card is a canvas-rendered PNG for one-click download/share. Lower time = better rank; anti-cheat is out of scope for this plan (existing leaderboard has no anti-cheat either).

**Tech Stack:** Next.js App Router API routes, file-based JSON storage (`.data/password-game-leaderboard.json`), HTML Canvas for card generation, existing Tailwind CSS patterns.

---

## Scope

**In scope:**
- Start timer when first keypress happens
- Stop timer when all rules are satisfied
- Result modal with seed, time, rules count, name field, submit button
- Canvas-rendered shareable card (PNG download)
- API route: `POST /api/password-game/leaderboard` (submit), `GET /api/password-game/leaderboard?seed=X` (fetch)
- Leaderboard page at `/games/password-game/leaderboard`

**Out of scope:**
- Daily challenge seed (separate plan)
- Replay/spectate mode
- Server-side anti-cheat
- Social login / auth (name is free-text entry)

---

## File Structure

**Create:**
- `src/app/api/password-game/leaderboard/route.ts` — GET + POST
- `src/app/games/password-game/leaderboard/page.tsx` — Leaderboard page (server component shell)
- `src/app/games/password-game/leaderboard/leaderboard-client.tsx` — interactive table
- `src/components/game/password-game/result-modal.tsx` — post-win modal + card generator
- `src/components/game/password-game/__tests__/result-card.test.ts` — logic tests for time formatting / card data

**Modify:**
- `src/components/game/password-game/password-game.tsx` — add timer, show result modal on completion

---

## Task 1: Leaderboard API route

**Files:**
- Create: `src/app/api/password-game/leaderboard/route.ts`

- [ ] **Step 1: Implement the route**

Create `src/app/api/password-game/leaderboard/route.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/password-game/leaderboard/route.ts
git commit -m "feat(password-game): add leaderboard API (seeded runs, file-backed)"
```

---

## Task 2: Result card helper logic + tests

**Files:**
- Create: `src/components/game/password-game/__tests__/result-card.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/components/game/password-game/__tests__/result-card.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatTime, computeDifficultyRating, pickResultTitle } from "../result-card-util";

describe("formatTime", () => {
  it("formats seconds to MM:SS", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(5)).toBe("00:05");
    expect(formatTime(65)).toBe("01:05");
    expect(formatTime(3599)).toBe("59:59");
  });

  it("handles > 1h as H:MM:SS", () => {
    expect(formatTime(3600)).toBe("1:00:00");
    expect(formatTime(7265)).toBe("2:01:05");
  });
});

describe("computeDifficultyRating", () => {
  it("returns a number between 1 and 5", () => {
    expect(computeDifficultyRating([1, 1, 1, 1])).toBeGreaterThanOrEqual(1);
    expect(computeDifficultyRating([5, 5, 5, 5, 5])).toBeLessThanOrEqual(5);
  });

  it("higher tiers = higher difficulty", () => {
    const low = computeDifficultyRating([1, 1, 1, 1]);
    const high = computeDifficultyRating([5, 5, 5, 5]);
    expect(high).toBeGreaterThan(low);
  });
});

describe("pickResultTitle", () => {
  it("returns a string title", () => {
    expect(typeof pickResultTitle({ timeSeconds: 60, rulesCleared: 7, tiers: [1, 1, 2, 2] })).toBe("string");
  });

  it("gives different titles for very fast vs very slow runs", () => {
    const fast = pickResultTitle({ timeSeconds: 20, rulesCleared: 7, tiers: [1, 1, 2, 2] });
    const slow = pickResultTitle({ timeSeconds: 1000, rulesCleared: 7, tiers: [1, 1, 2, 2] });
    expect(fast).not.toBe(slow);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- result-card.test.ts`

- [ ] **Step 3: Implement the helpers**

Create `src/components/game/password-game/result-card-util.ts`:

```typescript
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
}

/**
 * 1-5 rating based on tier mix. Each rule contributes its tier value;
 * average divided by 1.0, clamped to [1, 5].
 */
export function computeDifficultyRating(tiers: number[]): number {
  if (tiers.length === 0) return 1;
  const avg = tiers.reduce((a, b) => a + b, 0) / tiers.length;
  return Math.max(1, Math.min(5, Math.round(avg)));
}

interface TitleInput {
  timeSeconds: number;
  rulesCleared: number;
  tiers: number[];
}

const FAST_TITLES = ["The Unbreakable", "Speed Demon", "Machine-Fast"];
const AVERAGE_TITLES = ["Survivor", "Password Adept", "Chaos Tamer"];
const SLOW_TITLES = ["Persistent", "Barely Survived", "Methodical"];

export function pickResultTitle(input: TitleInput): string {
  const avgPerRule = input.timeSeconds / Math.max(1, input.rulesCleared);
  // Simple deterministic pick based on the input so the same run always
  // gets the same title (not true randomness here; avoids PRNG dependency).
  const bucket = avgPerRule < 6 ? FAST_TITLES
    : avgPerRule < 30 ? AVERAGE_TITLES
    : SLOW_TITLES;
  const idx = (input.tiers.reduce((a, b) => a + b, 0) + input.rulesCleared) % bucket.length;
  return bucket[idx];
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- result-card.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/result-card-util.ts src/components/game/password-game/__tests__/result-card.test.ts
git commit -m "feat(password-game): add result-card helpers (formatTime, difficulty, title)"
```

---

## Task 3: Result modal component

**Files:**
- Create: `src/components/game/password-game/result-modal.tsx`

- [ ] **Step 1: Implement**

Create `src/components/game/password-game/result-modal.tsx`:

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { Trophy, X, Download, Send, Loader2, CheckCircle } from "lucide-react";
import { formatTime, computeDifficultyRating, pickResultTitle } from "./result-card-util";

interface Props {
  open: boolean;
  seed: number;
  timeSeconds: number;
  rulesCleared: number;
  tiers: number[];
  onClose: () => void;
}

type SubmitState = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; rank: number } | { kind: "error"; message: string };

export function ResultModal({ open, seed, timeSeconds, rulesCleared, tiers, onClose }: Props) {
  const [name, setName] = useState("");
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const difficulty = computeDifficultyRating(tiers);
  const title = pickResultTitle({ timeSeconds, rulesCleared, tiers });

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    drawCard(canvasRef.current, { title, seed, timeSeconds, rulesCleared, difficulty });
  }, [open, title, seed, timeSeconds, rulesCleared, difficulty]);

  if (!open) return null;

  const handleSubmit = async () => {
    setSubmit({ kind: "sending" });
    try {
      const res = await fetch("/api/password-game/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          seed,
          time: timeSeconds,
          rules: rulesCleared,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmit({ kind: "error", message: (data as { error?: string }).error ?? "submit failed" });
        return;
      }
      const data = (await res.json()) as { rank: number };
      setSubmit({ kind: "sent", rank: data.rank });
    } catch (err) {
      setSubmit({ kind: "error", message: err instanceof Error ? err.message : "unknown error" });
    }
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `password-game-2-seed-${seed}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-(--border) bg-(--card) p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-(--muted) hover:text-(--foreground)"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <Trophy className="h-5 w-5 text-accent-amber" />
          <h2 className="font-display text-xl font-bold">{title}</h2>
        </div>

        <canvas
          ref={canvasRef}
          width={600}
          height={360}
          className="w-full rounded-lg border border-(--border) mb-4"
        />

        <div className="grid grid-cols-3 gap-3 text-center text-sm mb-4">
          <div>
            <div className="text-(--muted) text-xs">Time</div>
            <div className="font-mono font-bold">{formatTime(timeSeconds)}</div>
          </div>
          <div>
            <div className="text-(--muted) text-xs">Rules</div>
            <div className="font-mono font-bold">{rulesCleared}</div>
          </div>
          <div>
            <div className="text-(--muted) text-xs">Difficulty</div>
            <div className="font-mono font-bold">{"*".repeat(difficulty)}</div>
          </div>
        </div>

        {submit.kind !== "sent" ? (
          <div className="space-y-2">
            <label className="flex gap-2 items-center">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={16}
                className="flex-1 rounded-md border border-(--border) bg-(--background) px-3 py-2 text-sm"
                disabled={submit.kind === "sending"}
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submit.kind === "sending"}
                className="inline-flex items-center gap-1 rounded-md border border-accent-pink/50 bg-accent-pink/10 text-accent-pink px-3 py-2 text-sm font-medium hover:bg-accent-pink/20 disabled:opacity-60"
              >
                {submit.kind === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit
              </button>
            </label>
            {submit.kind === "error" && (
              <div className="text-xs text-red-400">{submit.message}</div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-accent-green">
            <CheckCircle className="h-4 w-4" />
            Submitted. Rank #{submit.rank}.
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={handleDownload}
            className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-(--border) px-3 py-2 text-sm hover:bg-(--background)"
          >
            <Download className="h-4 w-4" />
            Download card
          </button>
          <a
            href="/games/password-game/leaderboard"
            className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-(--border) px-3 py-2 text-sm hover:bg-(--background)"
          >
            <Trophy className="h-4 w-4" />
            Leaderboard
          </a>
        </div>
      </div>
    </div>
  );
}

interface DrawInput {
  title: string;
  seed: number;
  timeSeconds: number;
  rulesCleared: number;
  difficulty: number;
}

function drawCard(canvas: HTMLCanvasElement, d: DrawInput) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#0a0a14");
  bg.addColorStop(1, "#20102a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Accent border
  ctx.strokeStyle = "#ff3366";
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Password Game 2", 28, 48);

  // Subtitle (result title)
  ctx.fillStyle = "#ff3366";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.fillText(d.title, 28, 80);

  // Stats grid
  ctx.fillStyle = "#ffffff";
  ctx.font = "14px system-ui, sans-serif";

  const yStart = 140;
  const rowGap = 38;

  drawStat(ctx, "TIME", formatTime(d.timeSeconds), 28, yStart);
  drawStat(ctx, "RULES CLEARED", String(d.rulesCleared), 28, yStart + rowGap);
  drawStat(ctx, "DIFFICULTY", "*".repeat(d.difficulty), 28, yStart + rowGap * 2);
  drawStat(ctx, "SEED", String(d.seed), 28, yStart + rowGap * 3);

  // Footer
  ctx.fillStyle = "#888888";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("amindhou.com/games/password-game", w - 20, h - 20);
}

function drawStat(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number) {
  ctx.fillStyle = "#888888";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(label, x, y);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px monospace";
  ctx.fillText(value, x, y + 18);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/password-game/result-modal.tsx
git commit -m "feat(password-game): add result modal with canvas card + submit"
```

---

## Task 4: Wire timer and result modal into game

**Files:**
- Modify: `src/components/game/password-game/password-game.tsx`

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Update imports**

Add to the imports at the top:

```typescript
import { ResultModal } from "./result-modal";
import { useEffect } from "react";
```

(If `useEffect` is not already imported from react, update the react import to include it.)

- [ ] **Step 3: Add timer state and effects**

After the `const [startedAt] = useState...` line, add:

```typescript
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
```

Start the timer when the user types the first character. Find the `<textarea>` element's `onChange` handler:

```typescript
        onChange={(e) => setPassword(e.target.value)}
```

Replace with:

```typescript
        onChange={(e) => {
          setPassword(e.target.value);
          if (!timerRunning && e.target.value.length > 0) setTimerRunning(true);
        }}
```

Add a ticking effect and completion detection after the `chaosLevel` useMemo:

```typescript
  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  useEffect(() => {
    if (allPassed && timerRunning) {
      setTimerRunning(false);
      setShowResult(true);
    }
  }, [allPassed, timerRunning]);
```

Note: `allPassed` is declared earlier in the function; this useEffect depends on it.

Because `allPassed` is currently computed right before the `return`, you need to move it up above the new useEffects. Find:

```typescript
  const allPassed = activeIdx === -1 && rules.length > 0;
```

Move it to just after the `const satisfiedCount = ...` line.

- [ ] **Step 4: Reset timer and modal on new seed**

Find the `reset` callback:

```typescript
  const reset = useCallback(() => {
    setSeed(makeSeed());
    setPassword("");
  }, []);
```

Replace with:

```typescript
  const reset = useCallback(() => {
    setSeed(makeSeed());
    setPassword("");
    setElapsedSeconds(0);
    setTimerRunning(false);
    setShowResult(false);
  }, []);
```

- [ ] **Step 5: Render the modal**

Find the closing `</div>` just before `</div></div>);` at the end of the return statement. Before the `<ForeshadowOverlay ...>` element, add:

```typescript
      <ResultModal
        open={showResult}
        seed={seed}
        timeSeconds={elapsedSeconds}
        rulesCleared={rules.length}
        tiers={rules.map((r) => r.tier)}
        onClose={() => setShowResult(false)}
      />
```

- [ ] **Step 6: Update the completion banner to show time**

Find:

```typescript
      {allPassed && (
        <div className="mt-5 rounded-lg border border-accent-green/40 bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
          Tiers 1-2 cleared. (Tiers 3-5 coming soon.)
        </div>
      )}
```

Replace with:

```typescript
      {allPassed && (
        <div className="mt-5 rounded-lg border border-accent-green/40 bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
          All rules cleared in {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, "0")}!
        </div>
      )}
```

- [ ] **Step 7: Display running timer near seed**

Find the seed display section:

```typescript
          <span className="text-xs font-medium text-(--muted)">
            Seed: <span className="font-mono text-(--foreground)">{seed}</span>
          </span>
```

Replace with:

```typescript
          <span className="text-xs font-medium text-(--muted)">
            Seed: <span className="font-mono text-(--foreground)">{seed}</span>
            {" • "}
            <span className="font-mono text-(--foreground)">
              {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, "0")}
            </span>
          </span>
```

- [ ] **Step 8: Run tests**

Run: `npm test -- password-game`
Expected: all 80 tests still pass.

- [ ] **Step 9: Commit**

```bash
git add src/components/game/password-game/password-game.tsx
git commit -m "feat(password-game): add timer + result modal on completion"
```

---

## Task 5: Leaderboard page

**Files:**
- Create: `src/app/games/password-game/leaderboard/page.tsx`
- Create: `src/app/games/password-game/leaderboard/leaderboard-client.tsx`

- [ ] **Step 1: Create the server page**

Create `src/app/games/password-game/leaderboard/page.tsx`:

```typescript
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LeaderboardClient } from "./leaderboard-client";

export const metadata = {
  title: "Password Game 2 — Leaderboard",
  description: "Top times across all seeds of Password Game 2.",
};

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/games/password-game"
          className="inline-flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground) transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Game
        </Link>

        <h1 className="font-display text-4xl font-black tracking-tight mb-2">
          Leaderboard
        </h1>
        <p className="text-(--muted) mb-8">
          Fastest completed runs. Filter by seed to race a friend.
        </p>

        <LeaderboardClient />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the client component**

Create `src/app/games/password-game/leaderboard/leaderboard-client.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { Trophy, RefreshCw } from "lucide-react";
import { formatTime } from "@/components/game/password-game/result-card-util";

interface Entry {
  name: string;
  seed: number;
  time: number;
  rules: number;
  createdAt: string;
}

export function LeaderboardClient() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [seedFilter, setSeedFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = async (seed: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = seed.trim()
        ? `/api/password-game/leaderboard?seed=${encodeURIComponent(seed.trim())}`
        : `/api/password-game/leaderboard`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { entries: Entry[] };
      setEntries(data.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries("");
  }, []);

  return (
    <div className="w-full rounded-xl border border-(--border) bg-(--card) p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          placeholder="Filter by seed (optional)"
          value={seedFilter}
          onChange={(e) => setSeedFilter(e.target.value)}
          className="flex-1 rounded-md border border-(--border) bg-(--background) px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => fetchEntries(seedFilter)}
          disabled={loading}
          className="inline-flex items-center justify-center gap-1 rounded-md border border-accent-pink/50 bg-accent-pink/10 text-accent-pink px-4 py-2 text-sm font-medium hover:bg-accent-pink/20"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {entries.length === 0 && !loading ? (
        <div className="text-center py-12 text-(--muted) text-sm">
          <Trophy className="h-8 w-8 mx-auto mb-2 opacity-50" />
          {seedFilter ? `No entries for seed ${seedFilter}.` : "No entries yet. Be the first."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-(--muted) text-xs uppercase">
                <th className="text-left py-2">#</th>
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Time</th>
                <th className="text-left py-2">Seed</th>
                <th className="text-left py-2">Rules</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr
                  key={`${e.seed}-${e.createdAt}-${i}`}
                  className="border-t border-(--border)"
                >
                  <td className="py-2 font-mono text-(--muted)">{i + 1}</td>
                  <td className="py-2 font-medium">{e.name}</td>
                  <td className="py-2 font-mono">{formatTime(e.time)}</td>
                  <td className="py-2 font-mono text-xs text-(--muted)">
                    <a
                      href={`/games/password-game?seed=${e.seed}`}
                      className="hover:text-accent-pink"
                    >
                      {e.seed}
                    </a>
                  </td>
                  <td className="py-2 font-mono">{e.rules}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/games/password-game/leaderboard/
git commit -m "feat(password-game): add leaderboard page with seed filter"
```

---

## Task 6: Support ?seed=N URL param in the game

**Files:**
- Modify: `src/components/game/password-game/password-game.tsx`

- [ ] **Step 1: Add URL seed support**

Find:
```typescript
function makeSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
```

Replace with:
```typescript
function makeSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

function initialSeed(): number {
  if (typeof window === "undefined") return makeSeed();
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("seed");
  if (fromUrl) {
    const parsed = Number(fromUrl);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 0xffffffff) {
      return parsed >>> 0;
    }
  }
  return makeSeed();
}
```

Then find:
```typescript
  const [seed, setSeed] = useState<number>(() => makeSeed());
```

Replace with:
```typescript
  const [seed, setSeed] = useState<number>(() => initialSeed());
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/password-game/password-game.tsx
git commit -m "feat(password-game): accept ?seed= URL param for replay"
```

---

## Task 7: Verification

- [ ] **Step 1: Run tests**

Run: `npm test -- password-game`
Expected: 83 tests passing (80 existing + 3 new result-card tests).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors in password-game files.

- [ ] **Step 3: Manual browser test**

With dev server running:
- Visit `/games/password-game`
- Solve all rules → result modal appears with canvas card
- Enter a name, click Submit → see "Rank #N" confirmation
- Click Download card → downloads a PNG
- Close modal, click "New seed", confirm timer resets
- Visit `/games/password-game/leaderboard` → confirm entry is listed
- Click the seed link in the leaderboard → game loads with that seed

---

## Self-Review

- Timer starts only on first keypress (not on load) → accurate play time.
- Timer pauses when game is won → no drift.
- Seed URL param enables sharing specific runs.
- File-backed leaderboard follows existing `/api/leaderboard` pattern for consistency.
- `result-card-util.ts` has pure functions, easily testable.
- Result modal is a pure React component with canvas + fetch; can be tested via visual inspection.
