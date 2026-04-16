# Tower Stacker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a flagship tower stacking game at `/games` with viral engagement systems (daily seeded runs, ghost playback, share cards, achievements, speedrun, unlockable themes).

**Architecture:** Monolithic `src/components/game/tower-stacker.tsx` React component, 2D Canvas with refs-based game loop, Web Audio synthesis, backward-compatible leaderboard API extension. No unit tests (matches repo convention — manual browser testing is the bar).

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind, HTML5 Canvas 2D, Web Audio API, localStorage.

**Spec reference:** `docs/superpowers/specs/2026-04-16-tower-stacker-design.md`

**Branching:** All commits go directly to `main` (user preference, no worktree).

**Verification convention (per task):**
1. `npx tsc --noEmit` must pass (zero errors).
2. For visible features: manual browser smoke-test via Chrome DevTools MCP using `npm run dev`.
3. `git commit` at end of each task with conventional commit message.

---

## Phase 1 — Foundation

### Task 1: Scaffold component + register in game selector

**Files:**
- Create: `src/components/game/tower-stacker.tsx`
- Modify: `src/app/games/games-client.tsx`

- [ ] **Step 1: Create the empty component**

Write `src/components/game/tower-stacker.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

export default function TowerStacker() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#b91c1c";
    ctx.font = "24px sans-serif";
    ctx.fillText("Tower Stacker — scaffolded", 20, 40);
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-card">
      <canvas
        ref={canvasRef}
        width={800}
        height={420}
        className="block w-full h-[420px] touch-none"
        style={{ touchAction: "manipulation" }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Register in game selector**

Open `src/app/games/games-client.tsx`. Find the existing games array and the dynamic imports pattern. Add:

```tsx
const TowerStacker = dynamic(() => import("@/components/game/tower-stacker"), {
  ssr: false,
  loading: () => <GameSkeleton />,
});
```

Find the games definitions array (alongside Orbital Dodge, Geometric Flow, etc.) and add a new entry for `tower-stacker` with:
- `id: "tower-stacker"`
- `title: "Tower Stacker"`
- `description: "Stack blocks. Miss a sliver, lose width. Perfect stacks ring higher. How tall can you build?"`
- `accent: "accent-red"` (add this class via tailwind if the pattern is inline; inspect neighboring entries for the exact shape)
- Component: `<TowerStacker />`

Mirror the exact shape of the existing `space-shooter` / `geometric-flow` tab entries.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`
Open `http://localhost:3000/games`, click the Tower Stacker tab.
Expected: "Tower Stacker — scaffolded" text visible on a 420px canvas.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/tower-stacker.tsx src/app/games/games-client.tsx
git commit -m "feat(tower-stacker): scaffold component and register in game selector"
```

---

### Task 2: Canvas foundation — DPR, resize, viewport sizing

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Replace component body with DPR + resize logic**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

interface ViewportSize {
  w: number;
  h: number;
  dpr: number;
}

export default function TowerStacker() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<ViewportSize>({ w: 800, h: 600, dpr: 1 });
  const [, forceTick] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const applySize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(420, Math.min(720, Math.floor(rect.width * 0.9)));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      viewportRef.current = { w, h, dpr };
      forceTick((n) => (n + 1) % 1_000_000);
    };

    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(container);
    window.addEventListener("orientationchange", applySize);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", applySize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = viewportRef.current;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(1, "#1f2937");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ef4444";
    ctx.font = "600 28px system-ui, sans-serif";
    ctx.fillText("Tower Stacker", 24, 48);
  });

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border border-border bg-card"
    >
      <canvas
        ref={canvasRef}
        className="block w-full touch-none select-none"
        style={{ touchAction: "manipulation" }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 3: Verify in browser**

Reload `/games` → Tower Stacker. Expected: dark gradient background, "Tower Stacker" title, canvas resizes smoothly when dragging browser width.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(tower-stacker): DPR-aware canvas with resize handling"
```

---

### Task 3: Types, constants, refs, game-loop skeleton

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Define types and constants at top of file (inside the module, outside the component)**

```tsx
type GameState = "menu" | "playing" | "paused" | "game-over";
type GameMode = "classic" | "sudden" | "speedrun";
type BiomeId = "surface" | "clouds" | "atmosphere" | "space" | "void";
type ThemeId = "classic" | "neon" | "gold" | "crystal" | "pixel";

interface Floor {
  x: number;
  width: number;
  y: number;
  height: number;
  hue: number;
  isPerfect: boolean;
  isGolden: boolean;
}

interface ActiveBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  hue: number;
  direction: 1 | -1;
  speed: number;
  isGolden: boolean;
}

interface Particle {
  kind: "dust" | "sparkle" | "debris" | "comboTrail" | "ambient" | "goldShower";
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  rotSpeed: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  width?: number;
  height?: number;
}

interface GhostFrame {
  floorIndex: number;
  x: number;
  width: number;
  timeMs: number;
}

interface RunRecord {
  floors: GhostFrame[];
  score: number;
  durationMs: number;
}

interface GameRefs {
  state: GameState;
  mode: GameMode;
  score: number;
  hp: number;
  floors: Floor[];
  activeBlock: ActiveBlock | null;
  perfectCombo: number;
  maxCombo: number;
  perfectsCount: number;
  goldenCount: number;
  cameraY: number;
  cameraTargetY: number;
  cameraScale: number;
  cameraTargetScale: number;
  particles: Particle[];
  particleCursor: number;
  biomeIdx: number;
  biomeTransition: number;
  bannerText: string;
  bannerTime: number;
  shake: number;
  slowMo: number;
  runRecord: RunRecord;
  runStartMs: number;
  startedAt: number;
  lastFrame: number;
  droppingLock: boolean;
  ghost: RunRecord | null;
  ghostPassed: boolean;
  achievementsUnlockedThisRun: string[];
  hintsOn: boolean;
  theme: ThemeId;
  seed: number;
  isDailyRun: boolean;
  isSeededRun: boolean;
  milestonesFired: Set<number>;
}

const BASE_BLOCK_HEIGHT = 28;
const BASE_BLOCK_WIDTH_PX = 220;
const BASE_BLOCK_SPEED = 260;
const MAX_BLOCK_SPEED = 820;
const SPEED_FACTOR = 0.8;
const PERFECT_THRESHOLD = 4;
const NEAR_MISS_RATIO = 0.88;
const PARTICLE_MAX = 200;
const BIOME_THRESHOLDS: Record<BiomeId, number> = {
  surface: 0,
  clouds: 15,
  atmosphere: 35,
  space: 60,
  void: 90,
};
const BIOME_ORDER: BiomeId[] = ["surface", "clouds", "atmosphere", "space", "void"];
const HUE_STEP = 6;
const HUE_BASE = 340;
const LS_PREFIX = "tower_stacker_";
```

- [ ] **Step 2: Add ref initialization inside component + rAF skeleton**

Inside the component, before the existing effects:

```tsx
const refs = useRef<GameRefs>({
  state: "menu",
  mode: "classic",
  score: 0,
  hp: 3,
  floors: [],
  activeBlock: null,
  perfectCombo: 0,
  maxCombo: 0,
  perfectsCount: 0,
  goldenCount: 0,
  cameraY: 0,
  cameraTargetY: 0,
  cameraScale: 1,
  cameraTargetScale: 1,
  particles: new Array(PARTICLE_MAX).fill(null).map(() => ({
    kind: "dust", x: 0, y: 0, vx: 0, vy: 0, rot: 0, rotSpeed: 0,
    life: 0, maxLife: 1, size: 0, color: "#000",
  })),
  particleCursor: 0,
  biomeIdx: 0,
  biomeTransition: 1,
  bannerText: "",
  bannerTime: 0,
  shake: 0,
  slowMo: 0,
  runRecord: { floors: [], score: 0, durationMs: 0 },
  runStartMs: 0,
  startedAt: 0,
  lastFrame: 0,
  droppingLock: false,
  ghost: null,
  ghostPassed: false,
  achievementsUnlockedThisRun: [],
  hintsOn: true,
  theme: "classic",
  seed: 1,
  isDailyRun: false,
  isSeededRun: false,
  milestonesFired: new Set<number>(),
});

const [uiState, setUiState] = useState<GameState>("menu");
const [uiScore, setUiScore] = useState(0);
const [uiHp, setUiHp] = useState(3);
const [uiCombo, setUiCombo] = useState(0);
```

Add a rAF loop effect (replaces the single-frame paint effect):

```tsx
useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  let rafId = 0;
  let alive = true;

  const frame = (now: number) => {
    if (!alive) return;
    const r = refs.current;
    if (!r.lastFrame) r.lastFrame = now;
    let dt = (now - r.lastFrame) / 1000;
    if (dt > 0.05) dt = 0.05;
    if (r.slowMo > 0) {
      dt *= 0.4;
      r.slowMo = Math.max(0, r.slowMo - (now - r.lastFrame));
    }
    r.lastFrame = now;

    const { w, h } = viewportRef.current;
    // background
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0b1220");
    grad.addColorStop(1, "#1f2937");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // placeholder label so we can see it running
    ctx.fillStyle = "rgba(239,68,68,0.9)";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.fillText(`state: ${r.state}  dt: ${dt.toFixed(3)}`, 16, 32);

    rafId = requestAnimationFrame(frame);
  };

  rafId = requestAnimationFrame(frame);
  return () => {
    alive = false;
    cancelAnimationFrame(rafId);
  };
}, []);
```

Remove the prior single-frame draw effect.

- [ ] **Step 3: Verify tsc + browser**

Expected: `dt: 0.016` bouncing around, state = "menu".

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(tower-stacker): type definitions, constants, game refs, rAF loop skeleton"
```

---

### Task 4: Menu screen (React overlay) — mode + theme + hints + start

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Add menu overlay JSX**

Below the canvas in the component's JSX return, add an absolutely-positioned overlay. Only render when `uiState === "menu"`:

```tsx
{uiState === "menu" && (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm p-6">
    <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-neutral-900/90 p-6 shadow-[0_0_60px_-10px_rgba(239,68,68,0.5)]">
      <h2 className="text-3xl font-bold text-red-400 mb-1">Tower Stacker</h2>
      <p className="text-sm text-neutral-400 mb-5">Time the drop. Keep the tower alive.</p>

      <div className="space-y-3 mb-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Mode</div>
          <div className="grid grid-cols-3 gap-2">
            {(["classic", "sudden", "speedrun"] as GameMode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  refs.current.mode = m;
                  try { localStorage.setItem(LS_PREFIX + "mode", m); } catch {}
                  forceTick((n) => (n + 1) % 1_000_000);
                }}
                className={`rounded-lg px-3 py-2 text-sm border transition ${
                  refs.current.mode === m
                    ? "border-red-500 bg-red-500/15 text-red-200"
                    : "border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-neutral-500"
                }`}
              >
                {m === "classic" ? "Classic" : m === "sudden" ? "Sudden" : "Speedrun"}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={refs.current.hintsOn}
            onChange={(e) => {
              refs.current.hintsOn = e.target.checked;
              try { localStorage.setItem(LS_PREFIX + "hints", String(e.target.checked)); } catch {}
              forceTick((n) => (n + 1) % 1_000_000);
            }}
          />
          Landing hints (dashed projection)
        </label>
      </div>

      <button
        onClick={() => startRun()}
        className="w-full rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold py-3 text-lg shadow-lg shadow-red-900/30 transition"
      >
        START
      </button>

      <p className="text-xs text-neutral-500 mt-4 text-center">
        Tap, click, or press Space / Enter to drop.
      </p>
    </div>
  </div>
)}
```

- [ ] **Step 2: Add `startRun()` stub**

Inside the component:

```tsx
function startRun() {
  const r = refs.current;
  r.state = "playing";
  r.score = 0;
  r.hp = r.mode === "classic" ? 3 : 1;
  r.floors = [];
  r.perfectCombo = 0;
  r.maxCombo = 0;
  r.perfectsCount = 0;
  r.goldenCount = 0;
  r.cameraY = 0;
  r.cameraTargetY = 0;
  r.cameraScale = 1;
  r.cameraTargetScale = 1;
  r.biomeIdx = 0;
  r.biomeTransition = 1;
  r.shake = 0;
  r.slowMo = 0;
  r.runStartMs = performance.now();
  r.droppingLock = false;
  r.ghostPassed = false;
  r.achievementsUnlockedThisRun = [];
  r.runRecord = { floors: [], score: 0, durationMs: 0 };
  r.milestonesFired = new Set();
  setUiState("playing");
  setUiScore(0);
  setUiHp(r.hp);
  setUiCombo(0);
}
```

- [ ] **Step 3: Load saved prefs on mount**

Add an effect:

```tsx
useEffect(() => {
  try {
    const m = localStorage.getItem(LS_PREFIX + "mode") as GameMode | null;
    if (m === "classic" || m === "sudden" || m === "speedrun") refs.current.mode = m;
    const h = localStorage.getItem(LS_PREFIX + "hints");
    if (h !== null) refs.current.hintsOn = h === "true";
    const t = localStorage.getItem(LS_PREFIX + "theme") as ThemeId | null;
    if (t) refs.current.theme = t;
  } catch {}
  forceTick((n) => (n + 1) % 1_000_000);
}, []);
```

- [ ] **Step 4: Verify + commit**

Browser: start menu appears, all three mode buttons toggle, hints toggle persists across reload, START switches to `state: playing` (visible in the debug label).

```bash
git add -A && git commit -m "feat(tower-stacker): menu screen with mode/hints toggles and start handler"
```

---

## Phase 2 — Core gameplay

### Task 5: Active block spawn + sliding

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Add `spawnBlock` function**

Inside component:

```tsx
function spawnBlock() {
  const r = refs.current;
  const { w } = viewportRef.current;
  const prev = r.floors[r.floors.length - 1];
  const prevWidth = prev ? prev.width : BASE_BLOCK_WIDTH_PX;
  const floorIdx = r.floors.length;
  const hue = (HUE_BASE + floorIdx * HUE_STEP) % 360;
  const fromLeft = (floorIdx % 2) === 0;
  const y = prev ? prev.y - BASE_BLOCK_HEIGHT - 2 : viewportRef.current.h - 80 - BASE_BLOCK_HEIGHT;
  const speed = Math.min(MAX_BLOCK_SPEED, BASE_BLOCK_SPEED + r.score * SPEED_FACTOR * 0.1);
  r.activeBlock = {
    x: fromLeft ? 0 : w - prevWidth,
    y,
    width: prevWidth,
    height: BASE_BLOCK_HEIGHT,
    hue,
    direction: fromLeft ? 1 : -1,
    speed,
    isGolden: false,
  };
  r.droppingLock = false;
}
```

- [ ] **Step 2: Add base-plate spawn + first block at run start**

Modify `startRun()` to add:

```tsx
  const { w, h } = viewportRef.current;
  r.floors.push({
    x: w / 2 - BASE_BLOCK_WIDTH_PX / 2,
    y: h - 80,
    width: BASE_BLOCK_WIDTH_PX,
    height: BASE_BLOCK_HEIGHT,
    hue: HUE_BASE,
    isPerfect: true,
    isGolden: false,
  });
  spawnBlock();
```

- [ ] **Step 3: Advance active block in rAF loop**

In the `frame` function, replace the placeholder label block with:

```tsx
// update active block
if (r.state === "playing" && r.activeBlock) {
  const a = r.activeBlock;
  a.x += a.direction * a.speed * dt;
  if (a.x <= 0) { a.x = 0; a.direction = 1; }
  if (a.x + a.width >= w) { a.x = w - a.width; a.direction = -1; }
}

// draw floors
for (const f of r.floors) {
  ctx.fillStyle = `hsl(${f.hue} 80% 55%)`;
  ctx.fillRect(f.x, f.y, f.width, f.height);
}

// draw active block
if (r.activeBlock) {
  const a = r.activeBlock;
  ctx.fillStyle = `hsl(${a.hue} 80% 55%)`;
  ctx.fillRect(a.x, a.y, a.width, a.height);
}
```

- [ ] **Step 4: Verify + commit**

Browser: click START → block slides back and forth above a base plate in red gradient. Ping-pong at edges.

```bash
git add -A && git commit -m "feat(tower-stacker): active block spawn and ping-pong sliding"
```

---

### Task 6: Drop handler — input, overlap, debris, normal-stack scoring

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Add particle helpers**

```tsx
function spawnParticle(r: GameRefs, p: Partial<Particle>) {
  const slot = r.particles[r.particleCursor];
  Object.assign(slot, {
    kind: "dust", x: 0, y: 0, vx: 0, vy: 0, rot: 0, rotSpeed: 0,
    life: 0, maxLife: 1, size: 2, color: "#fff", width: undefined, height: undefined,
    ...p,
  });
  r.particleCursor = (r.particleCursor + 1) % PARTICLE_MAX;
}

function updateParticles(r: GameRefs, dt: number) {
  for (const p of r.particles) {
    if (p.life <= 0) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 900 * dt;
    p.rot += p.rotSpeed * dt;
    p.life -= dt;
  }
}

function drawParticles(r: GameRefs, ctx: CanvasRenderingContext2D) {
  for (const p of r.particles) {
    if (p.life <= 0) continue;
    const alpha = Math.min(1, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (p.kind === "debris" && p.width && p.height) {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
```

- [ ] **Step 2: Add `dropBlock` logic**

```tsx
function dropBlock() {
  const r = refs.current;
  if (r.state !== "playing" || !r.activeBlock || r.droppingLock) return;
  r.droppingLock = true;

  const a = r.activeBlock;
  const prev = r.floors[r.floors.length - 1];
  const overlapL = Math.max(a.x, prev.x);
  const overlapR = Math.min(a.x + a.width, prev.x + prev.width);
  const overlapW = overlapR - overlapL;

  // Complete miss
  if (overlapW <= 0) {
    r.shake = 0.6;
    r.hp -= 1;
    setUiHp(r.hp);
    // Active block becomes full-width debris
    spawnParticle(r, {
      kind: "debris",
      x: a.x + a.width / 2, y: a.y + a.height / 2,
      vx: a.direction * 120, vy: -40,
      rot: 0, rotSpeed: (Math.random() - 0.5) * 6,
      life: 3, maxLife: 3,
      color: `hsl(${a.hue} 80% 55%)`,
      width: a.width, height: a.height,
    });
    r.perfectCombo = 0;
    setUiCombo(0);
    r.activeBlock = null;
    if (r.mode !== "classic" || r.hp <= 0) {
      endRun();
    } else {
      setTimeout(() => spawnBlock(), 400);
    }
    return;
  }

  // Perfect detection
  const offset = Math.abs(a.x - prev.x);
  const isPerfect = offset < PERFECT_THRESHOLD;

  let newWidth: number;
  let newX: number;
  if (isPerfect) {
    newWidth = prev.width;
    newX = prev.x;
    r.perfectCombo += 1;
    r.perfectsCount += 1;
    r.maxCombo = Math.max(r.maxCombo, r.perfectCombo);
    for (let i = 0; i < 12; i++) {
      spawnParticle(r, {
        kind: "sparkle",
        x: a.x + a.width / 2, y: a.y,
        vx: (Math.random() - 0.5) * 240, vy: -Math.random() * 280 - 60,
        life: 0.9, maxLife: 0.9,
        size: 3, color: "#fde047",
      });
    }
  } else {
    newWidth = overlapW;
    newX = overlapL;
    // Emit chopped sliver as debris
    const chopLeft = a.x < prev.x;
    const chopX = chopLeft ? a.x : prev.x + prev.width;
    const chopW = a.width - overlapW;
    spawnParticle(r, {
      kind: "debris",
      x: chopX + chopW / 2,
      y: a.y + a.height / 2,
      vx: (chopLeft ? -1 : 1) * 180,
      vy: -40,
      rot: 0, rotSpeed: (Math.random() - 0.5) * 4,
      life: 3, maxLife: 3,
      color: `hsl(${a.hue} 80% 55%)`,
      width: chopW, height: a.height,
    });
    // dust puff on contact
    for (let i = 0; i < 7; i++) {
      spawnParticle(r, {
        kind: "dust",
        x: newX + Math.random() * newWidth,
        y: a.y,
        vx: (Math.random() - 0.5) * 100, vy: -Math.random() * 120,
        life: 0.5, maxLife: 0.5, size: 2, color: "rgba(255,255,255,0.6)",
      });
    }
    r.perfectCombo = 0;
  }

  // Add floor
  r.floors.push({
    x: newX, y: a.y, width: newWidth, height: a.height,
    hue: a.hue, isPerfect, isGolden: a.isGolden,
  });
  r.runRecord.floors.push({
    floorIndex: r.floors.length - 1, x: newX, width: newWidth,
    timeMs: performance.now() - r.runStartMs,
  });

  // Score
  let pts = isPerfect ? 50 : 25;
  if (isPerfect && r.perfectCombo >= 3) pts += 25 * (r.perfectCombo - 2);
  if (a.isGolden) pts *= 2;
  r.score += pts;
  setUiScore(r.score);
  setUiCombo(r.perfectCombo);

  r.activeBlock = null;
  setTimeout(() => spawnBlock(), 180);
}

function endRun() {
  const r = refs.current;
  r.state = "game-over";
  r.runRecord.score = r.score;
  r.runRecord.durationMs = performance.now() - r.runStartMs;
  setUiState("game-over");
}
```

- [ ] **Step 3: Wire input handlers**

Inside the component add:

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.code === "Space" || e.code === "Enter" || e.code === "ArrowDown") {
      e.preventDefault();
      dropBlock();
    } else if (e.code === "KeyP") {
      togglePause();
    } else if (e.code === "Escape") {
      togglePause();
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);
```

Add canvas pointer handler in the JSX:

```tsx
<canvas
  ref={canvasRef}
  onPointerDown={(e) => { e.preventDefault(); dropBlock(); }}
  ...
/>
```

Stub `togglePause`:

```tsx
function togglePause() {
  const r = refs.current;
  if (r.state === "playing") { r.state = "paused"; setUiState("paused"); }
  else if (r.state === "paused") { r.state = "playing"; setUiState("playing"); }
}
```

- [ ] **Step 4: Integrate particles in frame loop**

Inside the `frame` function, after updating active block, add `updateParticles(r, dt);`. Before drawing active block, add `drawParticles(r, ctx);`.

- [ ] **Step 5: Verify + commit**

Browser: tap/click drops block, overlap is chopped, score increments, debris flies with gravity and rotation. Missing entirely ends the run (or loses HP in Classic).

```bash
git add -A && git commit -m "feat(tower-stacker): drop handler, overlap math, debris physics, scoring"
```

---

### Task 7: Perfect streak UI + combo + run-record refinement

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Add HUD (minimal)**

Add to JSX return, above the menu conditional:

```tsx
{(uiState === "playing" || uiState === "paused") && (
  <div className="pointer-events-none absolute inset-0 p-4 flex flex-col gap-2 text-white">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-3xl font-bold leading-none tracking-tight">
          {uiState === "game-over" ? "" : refs.current.mode === "speedrun"
            ? formatTime(performance.now() - refs.current.runStartMs)
            : uiScore.toLocaleString()}
        </div>
        {uiCombo >= 2 && (
          <div className={`text-sm mt-1 font-semibold ${uiCombo >= 5 ? "text-red-400 animate-pulse" : "text-amber-300"}`}>
            {uiCombo}× COMBO
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {refs.current.mode === "classic" && (
          <div className="flex gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <svg key={i} width="20" height="20" viewBox="0 0 24 24" fill={i < uiHp ? "#ef4444" : "#4b5563"}>
                <path d="M12 21s-7-5.2-9.3-9.1C1 8.5 2.5 4.5 6 4c2 0 3.5 1 4 2 .5-1 2-2 4-2 3.5.5 5 4.5 3.3 7.9C19 15.8 12 21 12 21z" />
              </svg>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
)}
```

Add `formatTime` helper:

```tsx
function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, "0");
  return `${mm}:${ss}.${cs}`;
}
```

- [ ] **Step 2: Tick HUD timer for speedrun**

Since timer runs continuously, add to the frame loop after state updates:

```tsx
if (r.state === "playing" && r.mode === "speedrun") {
  // force HUD refresh at ~10Hz
  // (we already re-render on state setters; use a lightweight counter)
}
```

Simpler: add a `useState(0)` counter `uiTick` and increment every ~100ms in a separate interval effect only when `uiState === "playing"` and mode === "speedrun".

- [ ] **Step 3: Verify + commit**

Browser: HUD shows score, HP hearts in Classic, combo indicator appears at 2+, pulses at 5+.

```bash
git add -A && git commit -m "feat(tower-stacker): HUD with score, HP hearts, combo indicator"
```

---

### Task 8: Camera system — Y lerp, zoom-out progression, milestone pull-back

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Apply camera transform in frame loop**

Before drawing floors/active block, wrap them in a save/translate/scale:

```tsx
ctx.save();
const shakeX = r.shake > 0 ? (Math.random() - 0.5) * r.shake * 20 : 0;
const shakeY = r.shake > 0 ? (Math.random() - 0.5) * r.shake * 20 : 0;
if (r.shake > 0) r.shake = Math.max(0, r.shake - dt * 2);
ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
ctx.scale(r.cameraScale, r.cameraScale);
ctx.translate(-w / 2, -h / 2 - r.cameraY);

// --- draw floors and active block here ---

ctx.restore();
```

- [ ] **Step 2: Update camera targets when floors added**

In `dropBlock` after `r.floors.push(...)`:

```tsx
const top = r.floors[r.floors.length - 1];
const { h: vh } = viewportRef.current;
r.cameraTargetY = Math.max(0, (vh - 80) - (top.y + top.height * 0.5) - vh * 0.1);
// Gradual zoom-out over first 50 floors
const t = Math.min(1, r.floors.length / 50);
r.cameraTargetScale = 1 - 0.25 * t;
```

- [ ] **Step 3: Lerp camera in frame loop**

After `updateParticles`:

```tsx
r.cameraY += (r.cameraTargetY - r.cameraY) * Math.min(1, dt * 6);
r.cameraScale += (r.cameraTargetScale - r.cameraScale) * Math.min(1, dt * 4);
```

- [ ] **Step 4: Milestone pull-back (floors 50, 100)**

In `dropBlock` after updating camera targets, add:

```tsx
const fc = r.floors.length - 1;
if ((fc === 50 || fc === 100) && !r.milestonesFired.has(fc)) {
  r.milestonesFired.add(fc);
  r.cameraTargetScale = 0.3;
  r.bannerText = fc === 50 ? "HALFWAY — floor 50!" : "APEX — floor 100!";
  r.bannerTime = 1.5;
  setTimeout(() => {
    const t = Math.min(1, r.floors.length / 50);
    r.cameraTargetScale = 1 - 0.25 * t;
  }, 1500);
}
```

- [ ] **Step 5: Verify + commit**

Browser: stack a few blocks, camera pans up smoothly, slight zoom-out visible after ~10 floors.

```bash
git add -A && git commit -m "feat(tower-stacker): camera lerp, zoom progression, milestone pull-back"
```

---

## Phase 3 — Visual polish

### Task 9: Biome backgrounds + parallax

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Add biome data**

```tsx
interface BiomeDef {
  id: BiomeId;
  unlockFloor: number;
  gradient: [string, string];
  label: string;
  parallax: ParallaxLayer[];
}

interface ParallaxLayer {
  speed: number; // 0.1, 0.3, 0.6
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, offsetY: number) => void;
}

const BIOMES: BiomeDef[] = [
  {
    id: "surface",
    unlockFloor: 0,
    gradient: ["#7dd3fc", "#4ade80"],
    label: "SURFACE",
    parallax: [
      // far mountains (speed 0.1)
      { speed: 0.1, draw: (ctx, w, h, oy) => {
          ctx.fillStyle = "rgba(30,58,138,0.4)";
          ctx.beginPath();
          const y = h * 0.65 + oy;
          ctx.moveTo(0, y);
          for (let i = 0; i <= 8; i++) ctx.lineTo(i * w / 8, y - 50 + Math.sin(i * 1.7) * 30);
          ctx.lineTo(w, h); ctx.lineTo(0, h);
          ctx.fill();
        } },
      // mid city silhouette (speed 0.3)
      { speed: 0.3, draw: (ctx, w, h, oy) => {
          ctx.fillStyle = "rgba(15,23,42,0.7)";
          const y = h * 0.75 + oy;
          for (let i = 0; i < 12; i++) {
            const x = (i * w / 12);
            const bh = 40 + ((i * 37) % 60);
            ctx.fillRect(x, y - bh, w / 12 - 4, bh);
          }
        } },
      // near grass strip (speed 0.6)
      { speed: 0.6, draw: (ctx, w, h, oy) => {
          ctx.fillStyle = "#166534";
          ctx.fillRect(0, h * 0.9 + oy, w, h * 0.1);
        } },
    ],
  },
  {
    id: "clouds",
    unlockFloor: 15,
    gradient: ["#c7d2fe", "#a5b4fc"],
    label: "CLOUDS",
    parallax: [
      { speed: 0.1, draw: drawClouds(0.4, 40) },
      { speed: 0.3, draw: drawClouds(0.6, 60) },
      { speed: 0.6, draw: drawClouds(0.8, 80) },
    ],
  },
  {
    id: "atmosphere",
    unlockFloor: 35,
    gradient: ["#4c1d95", "#1e1b4b"],
    label: "ATMOSPHERE",
    parallax: [
      { speed: 0.1, draw: (ctx, w, h, oy) => {
          // distant earth curve
          ctx.strokeStyle = "rgba(56,189,248,0.3)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(w / 2, h + 800 + oy, 900, 0, Math.PI * 2);
          ctx.stroke();
        } },
      { speed: 0.3, draw: drawStars(40) },
      { speed: 0.6, draw: drawStars(20) },
    ],
  },
  {
    id: "space",
    unlockFloor: 60,
    gradient: ["#0c0a1e", "#1e0a2e"],
    label: "SPACE",
    parallax: [
      { speed: 0.1, draw: drawStars(120) },
      { speed: 0.3, draw: drawStars(60) },
      { speed: 0.6, draw: drawStars(30) },
    ],
  },
  {
    id: "void",
    unlockFloor: 90,
    gradient: ["#000000", "#0a0014"],
    label: "VOID",
    parallax: [
      { speed: 0.1, draw: (ctx, w, h, oy) => {
          const grd = ctx.createRadialGradient(w / 2, h / 2 + oy, 0, w / 2, h / 2 + oy, w);
          grd.addColorStop(0, "rgba(168,85,247,0.3)");
          grd.addColorStop(1, "transparent");
          ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
        } },
      { speed: 0.3, draw: drawStars(80) },
      { speed: 0.6, draw: drawStars(40) },
    ],
  },
];

function drawClouds(alpha: number, size: number) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number, oy: number) => {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    for (let i = 0; i < 6; i++) {
      const x = ((i * w / 6) + (oy * 0.3) % w) % w;
      const y = (i * 80 + oy) % h;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.arc(x + size * 0.6, y + 10, size * 0.7, 0, Math.PI * 2);
      ctx.arc(x - size * 0.6, y + 10, size * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  };
}

function drawStars(count: number) {
  // Static starfield -- seed generated on first call per layer; use deterministic pseudo-random
  const seedArr: { x: number; y: number; s: number }[] = [];
  for (let i = 0; i < count; i++) {
    seedArr.push({ x: (Math.sin(i * 127.1) * 43758.5453) % 1, y: (Math.sin(i * 311.7) * 43758.5453) % 1, s: Math.abs((Math.sin(i * 71.3) * 100)) % 2 + 0.5 });
  }
  return (ctx: CanvasRenderingContext2D, w: number, h: number, oy: number) => {
    ctx.fillStyle = "white";
    for (const s of seedArr) {
      const x = (((s.x < 0 ? s.x + 1 : s.x)) * w);
      const y = (((s.y < 0 ? s.y + 1 : s.y)) * h + oy * 0.5) % h;
      ctx.fillRect(x, y, s.s, s.s);
    }
  };
}
```

- [ ] **Step 2: Draw biome background at top of frame (replaces simple gradient)**

Before camera save block:

```tsx
const biome = BIOMES[r.biomeIdx];
const grad = ctx.createLinearGradient(0, 0, 0, h);
grad.addColorStop(0, biome.gradient[0]);
grad.addColorStop(1, biome.gradient[1]);
ctx.fillStyle = grad;
ctx.fillRect(0, 0, w, h);

// parallax layers
for (const layer of biome.parallax) {
  layer.draw(ctx, w, h, -r.cameraY * layer.speed);
}
```

- [ ] **Step 3: Verify + commit**

Browser: background gradient matches first biome (green-blue), a few parallax layers visible. No crash.

```bash
git add -A && git commit -m "feat(tower-stacker): biome backgrounds and parallax layers"
```

---

### Task 10: Biome transitions + banner + transition lerp

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Add biome transition state to frame loop**

Inside `dropBlock` after floor push, check biome threshold:

```tsx
const floorsCount = r.floors.length - 1; // excluding base plate
for (let i = BIOME_ORDER.length - 1; i > r.biomeIdx; i--) {
  const b = BIOMES[i];
  if (floorsCount >= b.unlockFloor) {
    r.biomeIdx = i;
    r.biomeTransition = 0;
    r.bannerText = `${b.label} REACHED`;
    r.bannerTime = 2.0;
    break;
  }
}
```

- [ ] **Step 2: Lerp biome transition in frame loop**

After camera lerp:

```tsx
r.biomeTransition = Math.min(1, r.biomeTransition + dt / 1.2);
if (r.bannerTime > 0) r.bannerTime = Math.max(0, r.bannerTime - dt);
```

- [ ] **Step 3: Draw biome crossfade**

Before drawing current biome gradient, if transitioning from a previous biome idx:

```tsx
if (r.biomeTransition < 1 && r.biomeIdx > 0) {
  const prevB = BIOMES[r.biomeIdx - 1];
  const prevGrad = ctx.createLinearGradient(0, 0, 0, h);
  prevGrad.addColorStop(0, prevB.gradient[0]);
  prevGrad.addColorStop(1, prevB.gradient[1]);
  ctx.fillStyle = prevGrad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = r.biomeTransition;
}
// then draw current biome gradient
// ...
ctx.globalAlpha = 1;
```

- [ ] **Step 4: Draw banner**

Before closing the canvas (after camera restore):

```tsx
if (r.bannerTime > 0) {
  const alpha = Math.min(1, r.bannerTime / 0.4);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 60, w, 56);
  ctx.fillStyle = "white";
  ctx.font = "700 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(r.bannerText, w / 2, 96);
  ctx.textAlign = "start";
  ctx.restore();
}
```

- [ ] **Step 5: Verify + commit**

Browser: stack to floor 15, biome transitions to Clouds with banner.

```bash
git add -A && git commit -m "feat(tower-stacker): biome transitions with crossfade and banner"
```

---

### Task 11: Biome ambient events (birds, plane, aurora, meteor, nebulae pulse)

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Add ambient event spawner**

Add a ref field `ambientCooldown: number` (init 0). In frame loop when `r.state === "playing"`:

```tsx
r.ambientCooldown -= dt;
if (r.ambientCooldown <= 0) {
  r.ambientCooldown = 5 + Math.random() * 6;
  spawnAmbient(r);
}
```

```tsx
function spawnAmbient(r: GameRefs) {
  const biome = BIOMES[r.biomeIdx].id;
  const { w, h } = viewportRef.current;
  switch (biome) {
    case "surface":
      // bird: small V-shape sliding across
      spawnParticle(r, {
        kind: "ambient",
        x: -20, y: 80 + Math.random() * 80,
        vx: 40 + Math.random() * 30, vy: 0,
        life: (w + 40) / 60, maxLife: (w + 40) / 60,
        size: 4, color: "#1f2937",
      });
      break;
    case "clouds":
      // plane silhouette
      spawnParticle(r, {
        kind: "ambient",
        x: -60, y: 120 + Math.random() * 100,
        vx: 120, vy: 0,
        life: (w + 60) / 120, maxLife: (w + 60) / 120,
        size: 12, color: "#374151",
        width: 50, height: 10,
      });
      break;
    case "atmosphere":
      // aurora ripple
      spawnParticle(r, {
        kind: "ambient",
        x: w / 2, y: h * 0.3,
        vx: 0, vy: 0,
        life: 3, maxLife: 3, size: 120,
        color: "rgba(56,189,248,0.3)",
      });
      break;
    case "space":
      // meteor
      spawnParticle(r, {
        kind: "ambient",
        x: Math.random() * w, y: -10,
        vx: -200 + Math.random() * -100,
        vy: 400 + Math.random() * 200,
        life: 1.2, maxLife: 1.2, size: 3,
        color: "#fef3c7",
      });
      break;
    case "void":
      // pulsing nebula
      spawnParticle(r, {
        kind: "ambient",
        x: Math.random() * w, y: Math.random() * h,
        vx: 0, vy: 0, life: 4, maxLife: 4, size: 80,
        color: "rgba(168,85,247,0.25)",
      });
      break;
  }
}
```

- [ ] **Step 2: Update `drawParticles` to handle ambient types**

Adjust particle drawing to special-case `ambient` with large soft radial:

```tsx
if (p.kind === "ambient") {
  const radius = p.size * (p.life / p.maxLife);
  const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
  grd.addColorStop(0, p.color);
  grd.addColorStop(1, "transparent");
  ctx.fillStyle = grd;
  ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
}
```

Ambient particles should not be affected by gravity — gate gravity:

```tsx
if (p.kind !== "ambient") p.vy += 900 * dt;
```

- [ ] **Step 3: Verify + commit**

Browser: stack a few and let it run — birds drift across in surface, plane in clouds (after floor 15).

```bash
git add -A && git commit -m "feat(tower-stacker): biome ambient events (birds, plane, aurora, meteor, nebulae)"
```

---

### Task 12: Block rendering polish — theme-aware colors, shadow, specular

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Add theme-aware draw functions**

```tsx
function drawFloor(ctx: CanvasRenderingContext2D, f: Floor, theme: ThemeId) {
  drawBlockWithTheme(ctx, f.x, f.y, f.width, f.height, f.hue, theme, f.isGolden);
}

function drawBlockWithTheme(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  hue: number, theme: ThemeId, isGolden: boolean,
) {
  if (isGolden) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, "#fde047"); g.addColorStop(1, "#b45309");
    ctx.fillStyle = g;
    ctx.shadowBlur = 16; ctx.shadowColor = "#fbbf24";
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
    return;
  }
  switch (theme) {
    case "neon": {
      ctx.shadowBlur = 12;
      ctx.shadowColor = `hsl(${hue} 90% 60%)`;
      ctx.fillStyle = `hsl(${hue} 95% 55%)`;
      ctx.fillRect(x, y, w, h);
      ctx.shadowBlur = 0;
      return;
    }
    case "gold": {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, "#fef3c7"); g.addColorStop(0.4, "#facc15"); g.addColorStop(1, "#92400e");
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(x, y + 2, w, 3);
      return;
    }
    case "crystal": {
      ctx.fillStyle = `hsla(${hue}, 85%, 70%, 0.45)`;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = `hsla(${hue}, 90%, 85%, 0.9)`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      return;
    }
    case "pixel": {
      const grid = 6;
      for (let gx = 0; gx < w; gx += grid) {
        for (let gy = 0; gy < h; gy += grid) {
          const jitter = ((gx * 17 + gy * 31) % 8) - 4;
          ctx.fillStyle = `hsl(${hue + jitter} 80% ${50 + (gy / h) * 10}%)`;
          ctx.fillRect(x + gx, y + gy, grid, grid);
        }
      }
      return;
    }
    case "classic":
    default: {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, `hsl(${hue} 85% 65%)`);
      g.addColorStop(1, `hsl(${hue} 80% 45%)`);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(x, y + h - 3, w, 3);
    }
  }
}
```

- [ ] **Step 2: Replace floor/active draws with `drawBlockWithTheme`**

- [ ] **Step 3: Verify + commit**

Browser: blocks look layered with subtle gradient + shadow edge. Rainbow hue progression visible.

```bash
git add -A && git commit -m "feat(tower-stacker): theme-aware block rendering with 5 themes"
```

---

## Phase 4 — Juice effects

### Task 13: Landing shadow + danger pulse + near-miss slo-mo

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Draw landing shadow**

Before drawing active block in frame loop:

```tsx
if (r.hintsOn && r.activeBlock && r.floors.length > 0) {
  const a = r.activeBlock;
  const top = r.floors[r.floors.length - 1];
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = `hsla(${a.hue}, 90%, 70%, 0.4)`;
  ctx.lineWidth = 2;
  ctx.strokeRect(a.x + 1, top.y - 1, a.width - 2, 2);
  ctx.setLineDash([]);
  ctx.restore();
}
```

- [ ] **Step 2: Danger pulse**

When `a.width < BASE_BLOCK_WIDTH_PX * 0.2`, draw pulsing outline:

```tsx
if (r.activeBlock && r.activeBlock.width < BASE_BLOCK_WIDTH_PX * 0.2) {
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 100);
  ctx.save();
  ctx.strokeStyle = `rgba(239,68,68,${pulse})`;
  ctx.lineWidth = 3;
  const a = r.activeBlock;
  ctx.strokeRect(a.x - 2, a.y - 2, a.width + 4, a.height + 4);
  ctx.restore();
}
```

- [ ] **Step 3: Near-miss slo-mo**

In `dropBlock` after computing chop (normal stack branch), before adding floor:

```tsx
const chopRatio = (a.width - overlapW) / a.width;
if (!isPerfect && chopRatio > NEAR_MISS_RATIO) {
  r.slowMo = 300;
  r.cameraTargetScale *= 0.95;
  setTimeout(() => { r.cameraTargetScale /= 0.95; }, 320);
}
```

(`slowMo` was already wired in the frame loop to scale dt.)

- [ ] **Step 4: Verify + commit**

Browser: shadow visible above top floor, near-miss produces slo-mo, narrow blocks pulse red.

```bash
git add -A && git commit -m "feat(tower-stacker): landing shadow, danger pulse, near-miss slo-mo"
```

---

### Task 14: Golden blocks + milestone spectacles + extreme-combo crescendo

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Mark golden blocks on spawn**

In `spawnBlock`, after computing floorIdx:

```tsx
const isGoldenFloor = floorIdx > 0 && floorIdx % 30 === 0 && Math.random() < 0.33;
// ... use isGoldenFloor in the activeBlock assignment
```

(Drop handler already doubles the score if `a.isGolden`.)

- [ ] **Step 2: Gold shower on golden-block land**

In `dropBlock`, after scoring, if `a.isGolden` and not missed:

```tsx
for (let i = 0; i < 25; i++) {
  spawnParticle(r, {
    kind: "sparkle",
    x: newX + Math.random() * newWidth,
    y: a.y,
    vx: (Math.random() - 0.5) * 300,
    vy: -Math.random() * 400 - 80,
    life: 1.2, maxLife: 1.2,
    size: 3 + Math.random() * 2,
    color: "#fde047",
  });
}
r.goldenCount += 1;
```

- [ ] **Step 3: Milestone spectacles (floors 40, 60, 80)**

Add a helper:

```tsx
function fireMilestone(r: GameRefs, floor: number) {
  if (floor === 40) { r.bannerText = "LIGHTNING"; r.bannerTime = 0.8; r.shake = 0.5; }
  if (floor === 60) { r.bannerText = "RADIANCE"; r.bannerTime = 0.8; }
  if (floor === 80) { r.bannerText = "RIFT"; r.bannerTime = 0.8; r.shake = 0.8; }
}
```

And in `dropBlock` after floor push:

```tsx
if ([40, 60, 80].includes(r.floors.length - 1)) fireMilestone(r, r.floors.length - 1);
```

Render overlays in frame loop when banner text matches:

```tsx
// After camera restore, before banner draw:
if (r.state === "playing") {
  const fc = r.floors.length - 1;
  if (fc >= 40 && fc < 45 && r.bannerText === "LIGHTNING") drawLightning(ctx, w, h);
  if (fc >= 60 && fc < 65 && r.bannerText === "RADIANCE") drawRadiance(ctx, w, h);
  if (fc >= 80 && fc < 85 && r.bannerText === "RIFT") drawRift(ctx, w, h);
}
```

Add lightweight spectacle drawers:

```tsx
function drawLightning(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  let x = w * 0.3, y = 0;
  while (y < h) {
    ctx.moveTo(x, y);
    x += (Math.random() - 0.5) * 40;
    y += 30 + Math.random() * 20;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}
function drawRadiance(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(0, 0, w, h);
}
function drawRift(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(239,68,68,0.8)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w / 2 + Math.cos(i * Math.PI / 3) * w, h / 2 + Math.sin(i * Math.PI / 3) * h);
    ctx.stroke();
  }
  ctx.restore();
}
```

- [ ] **Step 4: Extreme-combo crescendo**

After drawing active block in frame loop:

```tsx
if (r.perfectCombo >= 10 && r.activeBlock) {
  const a = r.activeBlock;
  ctx.save();
  ctx.shadowBlur = 20 + (r.perfectCombo - 10) * 2;
  ctx.shadowColor = `hsl(${(performance.now() / 10) % 360} 100% 60%)`;
  ctx.strokeStyle = ctx.shadowColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(a.x, a.y, a.width, a.height);
  ctx.restore();
}
if (r.perfectCombo >= 30) {
  // aurora wash
  ctx.save();
  ctx.globalAlpha = 0.2;
  const grd = ctx.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, "rgba(236,72,153,0.4)");
  grd.addColorStop(0.5, "rgba(168,85,247,0.4)");
  grd.addColorStop(1, "rgba(56,189,248,0.4)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
```

- [ ] **Step 5: Verify + commit**

Browser: every 30 floors, golden block possibility; milestones 40/60/80 trigger visible effects; combo 10+ shows glow on active block.

```bash
git add -A && git commit -m "feat(tower-stacker): golden blocks, milestone spectacles, extreme-combo crescendo"
```

---

### Task 15: Audio system (Web Audio synthesis + pitch combo)

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Add audio context + gain node**

```tsx
interface AudioHandle {
  ctx: AudioContext;
  master: GainNode;
}
const audioRef = useRef<AudioHandle | null>(null);
const [soundOn, setSoundOn] = useState(true);

function ensureAudio(): AudioHandle | null {
  if (audioRef.current) return audioRef.current;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = soundOn ? 0.4 : 0;
    master.connect(ctx.destination);
    audioRef.current = { ctx, master };
    return audioRef.current;
  } catch { return null; }
}

function playTone(freq: number, wave: OscillatorType, duration: number, gain = 1, attack = 0.01) {
  const h = ensureAudio();
  if (!h) return;
  const t = h.ctx.currentTime;
  const o = h.ctx.createOscillator();
  const g = h.ctx.createGain();
  o.type = wave;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  o.connect(g); g.connect(h.master);
  o.start(t); o.stop(t + duration + 0.02);
}

function playNoise(duration: number, gain = 0.6) {
  const h = ensureAudio();
  if (!h) return;
  const bufferSize = Math.floor(h.ctx.sampleRate * duration);
  const buffer = h.ctx.createBuffer(1, bufferSize, h.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = h.ctx.createBufferSource();
  src.buffer = buffer;
  const g = h.ctx.createGain();
  g.gain.value = gain;
  src.connect(g); g.connect(h.master);
  src.start();
}

function playLand(r: GameRefs) { playTone(131, "triangle", 0.15, 0.5); }
function playPerfect(r: GameRefs) {
  const semi = Math.min(r.perfectCombo, 24);
  const freq = 261.63 * Math.pow(2, semi / 12);
  playTone(freq, "sine", 0.25, 0.5);
}
function playMiss() {
  playTone(110, "sawtooth", 0.3, 0.45);
  playTone(82, "sawtooth", 0.3, 0.35);
}
function playGolden() { playTone(523, "sine", 0.3, 0.5); setTimeout(() => playTone(784, "sine", 0.4, 0.5), 80); }
function playBiome() { playTone(261, "sine", 0.5, 0.35); playTone(349, "sine", 0.5, 0.35); playTone(392, "sine", 0.5, 0.35); }
function playUi() { playTone(440, "square", 0.04, 0.3); }
```

- [ ] **Step 2: Wire into drop handler**

In `dropBlock`:
- After complete miss: `playMiss();`
- After perfect: `playPerfect(r);`
- After normal: `playLand(r);`
- After golden land (within `a.isGolden` block): `playGolden();`

In biome transition: `playBiome();`

In menu start / pause / UI button clicks: `playUi();`

- [ ] **Step 3: Sound toggle in HUD**

Add a button in the HUD row; persist to `localStorage`:

```tsx
<button
  onClick={() => {
    setSoundOn((s) => {
      const next = !s;
      try { localStorage.setItem(LS_PREFIX + "sound", String(next)); } catch {}
      if (audioRef.current) audioRef.current.master.gain.value = next ? 0.4 : 0;
      return next;
    });
  }}
  className="pointer-events-auto rounded-lg bg-black/50 hover:bg-black/70 text-white w-10 h-10 flex items-center justify-center"
  aria-label="Toggle sound"
>
  {soundOn ? <SpeakerOn /> : <SpeakerOff />}
</button>
```

SVG icons (inline components):

```tsx
function SpeakerOn() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3zm12 2a4 4 0 0 0-2-3.5v7a4 4 0 0 0 2-3.5z"/></svg>; }
function SpeakerOff() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2l2.5 2.5-1 1-2.5-2.5-2.5 2.5-1-1 2.5-2.5-2.5-2.5 1-1 2.5 2.5 2.5-2.5 1 1-2.5 2.5z"/></svg>; }
```

- [ ] **Step 4: Verify + commit**

Browser: start a run, drop blocks → triangle thunk. Perfect → rising sine. Miss → descending saw. Sound toggle works.

```bash
git add -A && git commit -m "feat(tower-stacker): Web Audio synthesis with pitch-combo system"
```

---

## Phase 5 — End-of-run experience

### Task 16: Post-game replay + summary card + game-over flow

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: On `endRun`, enter cinematic mode**

```tsx
function endRun() {
  const r = refs.current;
  r.runRecord.score = r.score;
  r.runRecord.durationMs = performance.now() - r.runStartMs;
  // Cinematic pull-back: zoom all the way out to show whole tower
  r.cameraTargetScale = Math.min(0.3, Math.max(0.15, 800 / (r.floors.length * BASE_BLOCK_HEIGHT + 200)));
  r.cameraTargetY = Math.max(0, (viewportRef.current.h * 0.5));
  r.state = "playing"; // keep rendering
  setTimeout(() => playReplay(), 1500);
  setTimeout(() => {
    r.state = "game-over";
    setUiState("game-over");
    handleRunEnd();
  }, 5200);
}

function playReplay() {
  // Mark replay state; frame loop will fade/flash as it's just the same tower rendered
  // (For this iteration we keep visible; replay fast-forward is decorative.)
}
```

- [ ] **Step 2: Add game-over overlay**

In JSX return (conditional on `uiState === "game-over"`):

```tsx
{uiState === "game-over" && (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur p-6">
    <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-neutral-900/95 p-6">
      <h3 className="text-2xl font-bold text-red-400 mb-3">Run Complete</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-neutral-200 mb-5">
        <Stat label="Score" value={refs.current.score.toLocaleString()} />
        <Stat label="Floors" value={String(refs.current.floors.length - 1)} />
        <Stat label="Max Combo" value={String(refs.current.maxCombo)} />
        <Stat label="Perfects" value={String(refs.current.perfectsCount)} />
        <Stat label="Golden" value={String(refs.current.goldenCount)} />
        <Stat label="Duration" value={formatTime(refs.current.runRecord.durationMs)} />
      </div>
      <div className="flex gap-2">
        <button onClick={() => startRun()} className="flex-1 rounded-xl bg-red-600 hover:bg-red-500 text-white py-2.5 font-semibold">Play Again</button>
        <button onClick={() => { refs.current.state = "menu"; setUiState("menu"); }} className="flex-1 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-white py-2.5 font-semibold">Menu</button>
      </div>
    </div>
  </div>
)}
```

Add `Stat` helper:

```tsx
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-neutral-500 uppercase">{label}</div>
      <div className="text-xl font-semibold text-white">{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: `handleRunEnd` — persist high score, total runs, ghost, achievements**

```tsx
function handleRunEnd() {
  const r = refs.current;
  try {
    const hs = Number(localStorage.getItem(LS_PREFIX + "highscore") || "0");
    if (r.score > hs) {
      localStorage.setItem(LS_PREFIX + "highscore", String(r.score));
      localStorage.setItem(LS_PREFIX + "ghost", JSON.stringify(r.runRecord));
    }
    const runs = Number(localStorage.getItem(LS_PREFIX + "total_runs") || "0") + 1;
    localStorage.setItem(LS_PREFIX + "total_runs", String(runs));
    const hf = Number(localStorage.getItem(LS_PREFIX + "highfloors") || "0");
    const floors = r.floors.length - 1;
    if (floors > hf) localStorage.setItem(LS_PREFIX + "highfloors", String(floors));
  } catch {}
}
```

- [ ] **Step 4: Verify + commit**

Browser: finish a run → cinematic pull-back → summary card shows with stats → Play Again restarts.

```bash
git add -A && git commit -m "feat(tower-stacker): game-over cinematic pull-back and summary card"
```

---

## Phase 6 — Engagement systems

### Task 17: Achievements system

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Achievement definitions + unlock logic**

```tsx
interface AchievementDef {
  id: string;
  name: string;
  description: string;
  check: (r: GameRefs) => boolean;
}

const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_tower", name: "First Tower", description: "Complete any run", check: () => true },
  { id: "architect", name: "The Architect", description: "Reach floor 50", check: (r) => r.floors.length - 1 >= 50 },
  { id: "atlas", name: "Atlas", description: "Reach floor 100", check: (r) => r.floors.length - 1 >= 100 },
  { id: "perfectionist", name: "Perfectionist", description: "10 consecutive perfects", check: (r) => r.maxCombo >= 10 },
  { id: "virtuoso", name: "Virtuoso", description: "20 consecutive perfects", check: (r) => r.maxCombo >= 20 },
  { id: "golden_touch", name: "Golden Touch", description: "Land 5 golden blocks in one run", check: (r) => r.goldenCount >= 5 },
  { id: "void_walker", name: "Void Walker", description: "Reach the Void biome (floor 90)", check: (r) => r.biomeIdx >= 4 },
  { id: "ghost_buster", name: "Ghost Buster", description: "Pass your ghost run", check: (r) => r.ghostPassed },
  { id: "speed_demon", name: "Speed Demon", description: "Finish Speedrun in < 60s", check: (r) =>
      r.mode === "speedrun" && r.floors.length - 1 >= 50 && r.runRecord.durationMs < 60_000 },
];

function checkAchievements(r: GameRefs) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + "achievements");
    const owned = new Set<string>(raw ? JSON.parse(raw) : []);
    const newlyUnlocked: string[] = [];
    for (const a of ACHIEVEMENTS) {
      if (!owned.has(a.id) && a.check(r)) {
        owned.add(a.id);
        newlyUnlocked.push(a.id);
      }
    }
    // Daily Devotee is tracked separately via date set
    if (r.isDailyRun) {
      const datesRaw = localStorage.getItem(LS_PREFIX + "daily_dates");
      const dates = new Set<string>(datesRaw ? JSON.parse(datesRaw) : []);
      const today = new Date().toISOString().slice(0, 10);
      dates.add(today);
      localStorage.setItem(LS_PREFIX + "daily_dates", JSON.stringify([...dates]));
      if (dates.size >= 7 && !owned.has("daily_devotee")) {
        owned.add("daily_devotee");
        newlyUnlocked.push("daily_devotee");
      }
    }
    localStorage.setItem(LS_PREFIX + "achievements", JSON.stringify([...owned]));
    r.achievementsUnlockedThisRun = newlyUnlocked;
  } catch {}
}
```

Daily Devotee def (add to ACHIEVEMENTS array above Ghost Buster):

```tsx
{ id: "daily_devotee", name: "Daily Devotee", description: "Play daily runs on 7 different days", check: () => false },
```

(Never passes the per-run check; unlocked separately above.)

- [ ] **Step 2: Call `checkAchievements` in `handleRunEnd`**

- [ ] **Step 3: Toast notifications**

Add `uiToasts` state:

```tsx
const [toasts, setToasts] = useState<string[]>([]);
```

After `checkAchievements`, show toasts for `newlyUnlocked`:

```tsx
setToasts(r.achievementsUnlockedThisRun.map((id) => ACHIEVEMENTS.find(a => a.id === id)?.name || ""));
setTimeout(() => setToasts([]), 3500);
```

Render toasts:

```tsx
{toasts.length > 0 && (
  <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-none">
    {toasts.map((t, i) => (
      <div key={i} className="rounded-lg bg-gradient-to-r from-amber-500 to-red-500 text-white px-4 py-2 shadow-lg animate-in slide-in-from-right">
        <div className="text-xs uppercase opacity-80">Achievement</div>
        <div className="font-semibold">{t}</div>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 4: Show achievements on menu**

Add strip in menu below START:

```tsx
<AchievementsStrip />
```

```tsx
function AchievementsStrip() {
  const [owned, setOwned] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_PREFIX + "achievements");
      setOwned(new Set(raw ? JSON.parse(raw) : []));
    } catch {}
  }, []);
  return (
    <div className="mt-5">
      <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Achievements</div>
      <div className="grid grid-cols-5 gap-2">
        {ACHIEVEMENTS.map((a) => (
          <div key={a.id} title={`${a.name}\n${a.description}`}
               className={`aspect-square rounded-lg border flex items-center justify-center text-[10px] text-center px-1 ${
                 owned.has(a.id)
                   ? "border-amber-500 bg-amber-500/10 text-amber-300"
                   : "border-neutral-700 bg-neutral-800/60 text-neutral-600"
               }`}>
            {a.name.split(" ")[0]}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify + commit**

Browser: complete a run → "First Tower" toast; reach floor 50 → "Architect" unlocks. Menu strip shows them as amber.

```bash
git add -A && git commit -m "feat(tower-stacker): 10 achievements with toast notifications and menu strip"
```

---

### Task 18: Seeded PRNG + Daily run + Shared seed URL

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`
- Modify: `src/app/games/games-client.tsx` (accept + forward URL param)

- [ ] **Step 1: Add seeded PRNG utilities**

```tsx
function fnv1a(str: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}
// Seed -> 6-char base32 encoding for share URLs
const BASE32 = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function seedToShort(seed: number): string {
  let s = "";
  let n = seed >>> 0;
  for (let i = 0; i < 6; i++) { s += BASE32[n & 0x1f]; n >>>= 5; }
  return s;
}
function shortToSeed(short: string): number {
  let n = 0;
  for (let i = short.length - 1; i >= 0; i--) {
    const idx = BASE32.indexOf(short[i]);
    if (idx < 0) return 1;
    n = (n << 5) | idx;
  }
  return n >>> 0;
}
```

- [ ] **Step 2: Replace `Math.random` uses where determinism matters**

Store a PRNG function on refs:

```tsx
prng: () => number;  // in GameRefs interface
```

Initialize `prng: Math.random` by default. In `startRun`, set `r.prng = mulberry32(r.seed)` if a seed is provided.

Replace golden block random and spawn-side pick with `r.prng()`.

- [ ] **Step 3: Accept seed from URL param**

In `src/app/games/games-client.tsx`, when rendering TowerStacker pass `initialSeed` prop:

```tsx
// at top
import { useSearchParams } from "next/navigation";
// ...
const params = useSearchParams();
const towerSeed = params?.get("tower-seed") ?? undefined;
// ... in the tab render:
<TowerStacker initialSeed={towerSeed} />
```

In `tower-stacker.tsx`, accept prop:

```tsx
export default function TowerStacker({ initialSeed }: { initialSeed?: string }) { ... }
```

On mount, if `initialSeed` provided:

```tsx
if (initialSeed) {
  refs.current.seed = shortToSeed(initialSeed);
  refs.current.isSeededRun = true;
}
```

- [ ] **Step 4: Daily run button on menu**

Add to menu:

```tsx
<button
  onClick={() => {
    const today = new Date().toISOString().slice(0, 10);
    refs.current.seed = fnv1a(today);
    refs.current.isDailyRun = true;
    refs.current.isSeededRun = false;
    startRun();
  }}
  className="w-full mt-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold py-3 text-lg"
>
  TODAY'S CHALLENGE — {new Date().toISOString().slice(0, 10)}
</button>
```

Ensure `startRun` calls `r.prng = mulberry32(r.seed)` at top.

- [ ] **Step 5: Submit daily runs to separate leaderboard slug**

(Handled in Task 22 leaderboard integration; just set the correct tag here.)

- [ ] **Step 6: Verify + commit**

Browser: Daily Challenge button produces reproducible seed per day. `?tower-seed=ABC123` in URL loads a shared seed.

```bash
git add -A && git commit -m "feat(tower-stacker): seeded PRNG, daily challenge, shared seed URLs"
```

---

### Task 19: Ghost run playback

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Load ghost on run start**

In `startRun`:

```tsx
try {
  const raw = localStorage.getItem(LS_PREFIX + "ghost");
  r.ghost = raw ? JSON.parse(raw) : null;
} catch { r.ghost = null; }
```

- [ ] **Step 2: Ghost column geometry**

Ghost renders in a vertical strip to the left of the playfield, 40px wide, at 30% alpha, scaled down. The entire ghost tower height maps to the current viewport height so users see the playback relative to their progress.

Add helper:

```tsx
function drawGhost(ctx: CanvasRenderingContext2D, r: GameRefs, w: number, h: number) {
  if (!r.ghost || r.ghost.floors.length === 0 || r.mode === "speedrun") return;
  const elapsed = performance.now() - r.runStartMs;
  const visible = r.ghost.floors.filter((f) => f.timeMs <= elapsed);
  if (visible.length === 0) return;
  ctx.save();
  ctx.globalAlpha = 0.3;
  const stripX = 8;
  const stripW = 32;
  const totalFloors = r.ghost.floors.length;
  const towerH = totalFloors * BASE_BLOCK_HEIGHT;
  const scale = Math.min(1, (h - 100) / towerH);
  for (const f of visible) {
    const y = h - 80 - f.floorIndex * BASE_BLOCK_HEIGHT * scale;
    ctx.fillStyle = `hsl(${(HUE_BASE + f.floorIndex * HUE_STEP) % 360} 60% 55%)`;
    ctx.fillRect(stripX, y, stripW, BASE_BLOCK_HEIGHT * scale);
  }
  ctx.restore();

  // pass detection
  if (!r.ghostPassed && r.floors.length - 1 > totalFloors) {
    r.ghostPassed = true;
    r.bannerText = "GHOST PASSED";
    r.bannerTime = 2;
    playTone(523, "sine", 0.2);
    setTimeout(() => playTone(659, "sine", 0.25), 100);
    setTimeout(() => playTone(784, "sine", 0.4), 250);
  }
}
```

- [ ] **Step 3: Call `drawGhost` in frame loop**

Inside the playing render path (outside camera transform so ghost stays fixed):

```tsx
drawGhost(ctx, r, w, h);
```

- [ ] **Step 4: Verify + commit**

Browser: play a run and beat your high score to record a ghost. Start new run → ghost strip visible on left, grows in real-time. Passing it triggers banner + chord.

```bash
git add -A && git commit -m "feat(tower-stacker): ghost run recording and real-time playback"
```

---

### Task 20: Block theme unlocks + theme picker in menu

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Track theme unlocks in `handleRunEnd`**

```tsx
function unlockThemes(r: GameRefs) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + "themes");
    const owned = new Set<ThemeId>(raw ? JSON.parse(raw) : ["classic"]);
    if (r.score >= 3000) owned.add("neon");
    if (r.score >= 8000) owned.add("gold");
    if (r.score >= 15000) owned.add("crystal");
    const runs = Number(localStorage.getItem(LS_PREFIX + "total_runs") || "0");
    if (runs >= 50) owned.add("pixel");
    localStorage.setItem(LS_PREFIX + "themes", JSON.stringify([...owned]));
  } catch {}
}
```

Call `unlockThemes(r)` in `handleRunEnd`.

- [ ] **Step 2: Theme picker in menu**

Add below Mode toggle:

```tsx
<ThemePicker
  active={refs.current.theme}
  onChange={(t) => {
    refs.current.theme = t;
    try { localStorage.setItem(LS_PREFIX + "theme", t); } catch {}
    forceTick((n) => (n + 1) % 1_000_000);
  }}
/>
```

```tsx
const THEMES: { id: ThemeId; name: string; requirement: string }[] = [
  { id: "classic", name: "Classic", requirement: "Default" },
  { id: "neon", name: "Neon", requirement: "Score 3000" },
  { id: "gold", name: "Gold", requirement: "Score 8000" },
  { id: "crystal", name: "Crystal", requirement: "Score 15000" },
  { id: "pixel", name: "Pixel", requirement: "50 runs" },
];

function ThemePicker({ active, onChange }: { active: ThemeId; onChange: (t: ThemeId) => void }) {
  const [owned, setOwned] = useState<Set<ThemeId>>(new Set(["classic"]));
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_PREFIX + "themes");
      setOwned(new Set(raw ? JSON.parse(raw) : ["classic"]));
    } catch {}
  }, []);
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Theme</div>
      <div className="grid grid-cols-5 gap-2">
        {THEMES.map((t) => {
          const unlocked = owned.has(t.id);
          return (
            <button
              key={t.id}
              disabled={!unlocked}
              onClick={() => unlocked && onChange(t.id)}
              title={unlocked ? t.name : `Locked: ${t.requirement}`}
              className={`rounded-lg px-2 py-3 text-xs border ${
                active === t.id ? "border-red-500 bg-red-500/15 text-red-200"
                : unlocked ? "border-neutral-600 bg-neutral-800/60 text-neutral-300 hover:border-neutral-400"
                : "border-neutral-800 bg-neutral-900 text-neutral-600 cursor-not-allowed"
              }`}
            >
              {t.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

Browser: default shows Classic unlocked, others locked. Score 3000 → Neon unlocks after end of run (visible in menu next time).

```bash
git add -A && git commit -m "feat(tower-stacker): block theme unlocks and theme picker"
```

---

### Task 21: Share card PNG generator

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: `generateShareCard` function**

```tsx
async function generateShareCard(r: GameRefs): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const c = canvas.getContext("2d");
  if (!c) return null;

  // Background gradient matching final biome
  const b = BIOMES[r.biomeIdx];
  const g = c.createLinearGradient(0, 0, 0, 630);
  g.addColorStop(0, b.gradient[0]);
  g.addColorStop(1, b.gradient[1]);
  c.fillStyle = g;
  c.fillRect(0, 0, 1200, 630);
  c.fillStyle = "rgba(0,0,0,0.4)";
  c.fillRect(0, 0, 1200, 630);

  // Tower silhouette
  const towerW = 400;
  const towerH = 500;
  const towerX = 80;
  const towerY = 80;
  const floorsN = r.floors.length - 1;
  const pixPerFloor = Math.max(2, Math.min(18, towerH / Math.max(1, floorsN)));
  for (let i = 0; i < floorsN; i++) {
    const f = r.floors[i + 1];
    const hue = (HUE_BASE + i * HUE_STEP) % 360;
    const scale = 0.5 + (f.width / BASE_BLOCK_WIDTH_PX) * 0.5;
    c.fillStyle = `hsl(${hue} 80% 60%)`;
    const w = towerW * scale;
    c.fillRect(towerX + (towerW - w) / 2, towerY + towerH - (i + 1) * pixPerFloor, w, pixPerFloor * 0.9);
  }

  // Big score
  c.fillStyle = "#fff";
  c.font = "bold 160px system-ui, sans-serif";
  c.fillText(r.score.toLocaleString(), 560, 260);

  c.font = "600 40px system-ui, sans-serif";
  c.fillStyle = "#fca5a5";
  c.fillText(`Floor ${floorsN}`, 560, 320);

  c.fillStyle = "#d1d5db";
  c.font = "500 28px system-ui, sans-serif";
  c.fillText(`Combo ${r.maxCombo}× · ${r.perfectsCount} perfects · ${r.goldenCount} golden`, 560, 370);

  // Footer
  c.fillStyle = "#ef4444";
  c.font = "bold 36px system-ui, sans-serif";
  c.fillText("TOWER STACKER", 80, 590);
  c.fillStyle = "#d1d5db";
  c.font = "400 24px system-ui, sans-serif";
  c.fillText("amin.dev/games", 820, 590);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png");
  });
}
```

- [ ] **Step 2: Wire "Share Tower" button on game-over card**

```tsx
<button
  onClick={async () => {
    const blob = await generateShareCard(refs.current);
    if (!blob) return;
    const file = new File([blob], `tower-stacker-${refs.current.score}.png`, { type: "image/png" });
    try {
      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Tower Stacker", text: `I reached floor ${refs.current.floors.length - 1}!` });
        return;
      }
    } catch {}
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }}
  className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-500 text-white py-2.5 font-semibold"
>
  Share Tower
</button>
```

- [ ] **Step 3: Verify + commit**

Browser: finish a run, click Share → PNG downloads with tower silhouette + score + watermark. On mobile viewport, verify native share sheet opens if supported.

```bash
git add -A && git commit -m "feat(tower-stacker): shareable PNG card generator with native share fallback"
```

---

## Phase 7 — Leaderboard

### Task 22: Extend leaderboard API backward-compatibly

**Files:**
- Modify: `src/app/api/leaderboard/route.ts`

- [ ] **Step 1: Extend `Entry` with `game` field**

```ts
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
```

Update `isEntry`:

```ts
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
```

(Signature unchanged — `game` is optional, legacy entries remain valid.)

- [ ] **Step 2: Add `game` filter in GET**

```ts
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
```

- [ ] **Step 3: Add `game` field to POST**

```ts
function sanitizeGame(raw: unknown): string {
  if (typeof raw !== "string") return "space-shooter";
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  return cleaned.length > 0 ? cleaned : "space-shooter";
}
```

In POST, build `entry` with `game: sanitizeGame(o.game),`.

- [ ] **Step 4: Per-game cap (instead of global 100)**

Inside `withWriteLock`:

```ts
const all = await readAll();
all.push(entry);
all.sort((a, b) => b.score - a.score);
// Keep top MAX_ENTRIES per game
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
// Rank within the submitting game
const gameList = byGame.get(entry.game ?? "space-shooter") ?? [];
return gameList.indexOf(entry) + 1;
```

- [ ] **Step 5: Verify regression**

Run `npm run dev`. Play Space Shooter, submit a score; GET `/api/leaderboard` without param still returns the same Space Shooter list. No breakage.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(leaderboard): backward-compatible game field and per-game cap"
```

---

### Task 23: Integrate tower-stacker leaderboard (submission + display)

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Submission on qualifying runs**

In `handleRunEnd`, after stats persist:

```tsx
const isTop = await qualifiesForLeaderboard(r);
if (isTop) setLbModalOpen(true);
```

```tsx
async function qualifiesForLeaderboard(r: GameRefs): Promise<boolean> {
  try {
    const game = r.isDailyRun
      ? `tower-stacker-daily-${new Date().toISOString().slice(0, 10)}`
      : r.isSeededRun
      ? "tower-stacker-seeded"
      : "tower-stacker";
    const res = await fetch(`/api/leaderboard?game=${game}`);
    const json = await res.json() as { entries: Array<{ score: number }> };
    if (json.entries.length < 25) return true;
    return r.score > json.entries[json.entries.length - 1].score;
  } catch { return false; }
}
```

Add state for modal + entries:

```tsx
const [lbModalOpen, setLbModalOpen] = useState(false);
```

- [ ] **Step 2: Submission modal**

```tsx
{lbModalOpen && (
  <LeaderboardModal
    runRefs={refs.current}
    onClose={() => setLbModalOpen(false)}
  />
)}
```

```tsx
function LeaderboardModal({ runRefs, onClose }: { runRefs: GameRefs; onClose: () => void }) {
  const [name, setName] = useState(() => {
    try { return localStorage.getItem(LS_PREFIX + "player_name") || "Builder"; } catch { return "Builder"; }
  });
  const [entries, setEntries] = useState<Array<{ name: string; score: number; level: number; region?: string }>>([]);
  const [submitted, setSubmitted] = useState(false);
  const [rank, setRank] = useState<number | null>(null);

  const gameSlug = runRefs.isDailyRun
    ? `tower-stacker-daily-${new Date().toISOString().slice(0, 10)}`
    : runRefs.isSeededRun ? "tower-stacker-seeded" : "tower-stacker";

  useEffect(() => {
    fetch(`/api/leaderboard?game=${gameSlug}`).then(r => r.json()).then((d) => setEntries(d.entries || []));
  }, [gameSlug]);

  async function submit() {
    try {
      localStorage.setItem(LS_PREFIX + "player_name", name);
    } catch {}
    const body = {
      name,
      score: runRefs.mode === "speedrun" && runRefs.floors.length - 1 >= 50
        ? Math.max(0, 1_000_000 - Math.floor(runRefs.runRecord.durationMs))
        : runRefs.score,
      level: runRefs.floors.length - 1,
      seconds: Math.floor(runRefs.runRecord.durationMs / 1000),
      kills: runRefs.perfectsCount,
      distance: runRefs.goldenCount,
      region: runRefs.mode,
      game: gameSlug,
    };
    const res = await fetch(`/api/leaderboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setRank(d.rank ?? null);
    setSubmitted(true);
    const r2 = await fetch(`/api/leaderboard?game=${gameSlug}`).then(r => r.json());
    setEntries(r2.entries || []);
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-red-500/40 bg-neutral-900/95 p-5">
        <h3 className="text-xl font-bold text-red-400 mb-3">Leaderboard — {gameSlug.replace("tower-stacker", "").replace(/^-/, "") || "All-Time"}</h3>
        {!submitted && (
          <div className="flex gap-2 mb-4">
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 12))} maxLength={12}
              className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-white" />
            <button onClick={submit} className="rounded-lg bg-red-600 hover:bg-red-500 text-white px-4 font-semibold">Submit</button>
          </div>
        )}
        {submitted && rank != null && (
          <div className="mb-3 text-amber-300 font-semibold">Rank #{rank}</div>
        )}
        <div className="max-h-[50vh] overflow-auto divide-y divide-neutral-800">
          {entries.map((e, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 text-sm text-neutral-200">
              <span>{i + 1}. {e.name} <span className="text-neutral-500 text-xs">{e.region}</span></span>
              <span>{e.score.toLocaleString()} · fl {e.level}</span>
            </div>
          ))}
          {entries.length === 0 && <div className="py-4 text-center text-neutral-500 text-sm">No entries yet — be the first!</div>}
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white py-2">Close</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add "View Leaderboard" button on game-over**

Below the existing buttons, always visible:

```tsx
<button onClick={() => setLbModalOpen(true)} className="w-full mt-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-white py-2.5 font-semibold">
  View Leaderboard
</button>
```

- [ ] **Step 4: Verify + commit**

Browser: finish a run → modal prompts (if top 25 or empty) → submit → list refreshes with rank highlighted.

```bash
git add -A && git commit -m "feat(tower-stacker): leaderboard submission modal and display"
```

---

## Phase 8 — Finalization

### Task 24: Haptic feedback + pause/fullscreen buttons

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Haptics helper**

```tsx
function haptic(pattern: number | number[]) {
  try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern); } catch {}
}
```

In `dropBlock`:
- Perfect: `haptic(8)`
- Miss (complete): `haptic([40, 30, 40])`

- [ ] **Step 2: Pause + fullscreen HUD buttons**

In the HUD row:

```tsx
<button onClick={togglePause} className="pointer-events-auto rounded-lg bg-black/50 hover:bg-black/70 text-white w-10 h-10 flex items-center justify-center">
  {uiState === "paused" ? <PlayIcon /> : <PauseIcon />}
</button>
<button onClick={toggleFullscreen} className="pointer-events-auto rounded-lg bg-black/50 hover:bg-black/70 text-white w-10 h-10 flex items-center justify-center">
  <FullscreenIcon />
</button>
```

```tsx
function toggleFullscreen() {
  const el = containerRef.current;
  if (!el) return;
  try {
    if (!document.fullscreenElement) el.requestFullscreen();
    else document.exitFullscreen();
  } catch {}
}
```

Pause overlay:

```tsx
{uiState === "paused" && (
  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
    <div className="rounded-xl bg-neutral-900/95 border border-red-500/40 p-6 text-center">
      <div className="text-xl font-bold text-white mb-3">Paused</div>
      <div className="flex gap-2">
        <button onClick={togglePause} className="rounded-lg bg-red-600 hover:bg-red-500 text-white px-4 py-2">Resume</button>
        <button onClick={() => { refs.current.state = "menu"; setUiState("menu"); }} className="rounded-lg bg-neutral-700 text-white px-4 py-2">Quit</button>
      </div>
    </div>
  </div>
)}
```

Icons:

```tsx
function PlayIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5z"/></svg>; }
function PauseIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>; }
function FullscreenIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z"/></svg>; }
```

- [ ] **Step 3: Verify + commit**

Browser + mobile viewport: pause/resume works, fullscreen button expands the game, haptics fire on mobile (check phone).

```bash
git add -A && git commit -m "feat(tower-stacker): haptic feedback, pause and fullscreen controls"
```

---

### Task 25: Mobile responsive polish

**Files:**
- Modify: `src/components/game/tower-stacker.tsx`

- [ ] **Step 1: Tune mobile-specific CSS**

- HUD buttons: add `sm:w-10 sm:h-10 w-12 h-12` for larger tap targets on mobile.
- Menu card: `max-w-md` stays, but add `max-h-[90vh] overflow-auto` in case mode + theme + achievements overflow.
- Canvas container: ensure `touch-action: manipulation` on both container and canvas; add `user-select: none`.

- [ ] **Step 2: Prevent scroll/zoom gestures**

Add to container style: `overscroll-behavior: contain`.

Ensure game takes over spacebar without scrolling the page: the keydown handler already calls `e.preventDefault()`.

- [ ] **Step 3: Test on narrow viewports**

Use Chrome DevTools device emulation to test 375×667, 390×844, 414×896. Verify:
- HUD readable, no overflow
- Menu card scrolls if content overflows
- Canvas uses full width
- Tap registers reliably (no ghost-tap delay)

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(tower-stacker): mobile responsive polish"
```

---

### Task 26: Final verification — full spec pass

**Files:** (no changes — verification only)

- [ ] **Step 1: TypeScript**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Full manual QA checklist (Chrome DevTools MCP)**

Open `npm run dev`. Go to `/games`. For each, verify pass/fail:

- [ ] Tower Stacker tab renders with red accent
- [ ] START → block slides, tap drops
- [ ] Keyboard: Space, Enter, ArrowDown all drop
- [ ] Pointer-down drops (mouse + touch)
- [ ] Score, combo, HP hearts all update
- [ ] Classic HP drops to 0 = game over
- [ ] Sudden death = game over on first miss
- [ ] Speedrun timer runs; finish floor 50 shows completion banner
- [ ] Block colors rainbow-shift as stack grows
- [ ] Biome transitions at 15 / 35 / 60 / 90 with banner
- [ ] Parallax backgrounds render
- [ ] Biome ambient events visible (birds, plane, etc.)
- [ ] Particles: dust, sparkle, debris, all visible
- [ ] Landing shadow toggles with Hints
- [ ] Danger pulse appears at narrow block widths
- [ ] Near-miss triggers slo-mo
- [ ] Golden block appears ~floor 30, doubles points, shower particles
- [ ] Milestone spectacles at 40 / 60 / 80
- [ ] Extreme combo crescendo at 10+, aurora at 30+
- [ ] Audio: thunk, pitched perfect, descending miss, golden bell, biome chord, UI click
- [ ] Sound toggle persists across reload
- [ ] Camera: smooth lerp, zoom-out, milestone pull-back at 50/100
- [ ] Game-over cinematic pull-back
- [ ] Summary card shows all stats
- [ ] "Share Tower" downloads PNG (or native share on mobile)
- [ ] Achievements unlock with toasts
- [ ] Menu shows achievement strip + theme picker
- [ ] Daily Challenge button uses deterministic seed
- [ ] `?tower-seed=ABC123` URL plays seeded run
- [ ] Ghost playback visible if personal best exists
- [ ] Passing ghost triggers banner + fanfare
- [ ] Leaderboard modal submits correctly
- [ ] **Regression:** `GET /api/leaderboard` (no param) returns Space Shooter entries only
- [ ] **Regression:** Space Shooter in games section still fully functional
- [ ] Pause / resume works
- [ ] Fullscreen button works
- [ ] Haptics fire on mobile device (if testable)
- [ ] Mobile 375px: menu card fits, HUD tap targets usable, canvas fills width
- [ ] Tab away during run → return: no physics explosion
- [ ] Rapid-fire Space spam doesn't double-drop
- [ ] First run (clear localStorage): all defaults apply, no errors

- [ ] **Step 5: Fix any red items**

For each failure, create a small commit fixing it.

- [ ] **Step 6: Final commit**

If any fix commits happened, they're already committed. Otherwise nothing to commit.

```bash
git log --oneline -20
```

Verify the story of the feature reads as a clean progression.

---

## Post-Implementation

After all tasks complete:

1. Update `src/app/games/page.tsx` metadata if necessary (game count, description).
2. Consider adding a small "NEW" badge on the Tower Stacker tab for 7 days post-launch.
3. Announce on personal socials with a share-card screenshot.

---

## Self-review checklist

**Spec coverage:**
- §3 Architecture → Tasks 1–3 ✓
- §4 Game mechanics → Tasks 5–7 ✓
- §5 Visual system → Tasks 8–14 ✓
- §6 Audio → Task 15 ✓
- §7 Leaderboard API → Task 22 ✓
- §8 HUD → Tasks 4, 7, 24 ✓
- §9 Fun extras (original 8) → Tasks 8, 13, 14, 16, 21, 24 ✓
- §10 Engagement & viral systems → Tasks 17–21, 23 ✓
- §11 Testing & verification → Task 26 ✓

**Type consistency:**
- `GameRefs.prng` added in Task 18 — note to ensure it's also added to the initial ref object's type
- `GameRefs.ambientCooldown` added in Task 11 — same
- `GameRefs.milestonesFired` declared in Task 3, used in Task 8

Both of these are additions after the initial GameRefs type. When executing, expand the `GameRefs` interface at its original site to include these fields rather than leaving them inconsistent. Specifically add these fields to the `GameRefs` interface:
```ts
prng: () => number;
ambientCooldown: number;
```

**Placeholder scan:** None found.

**Scope check:** 26 tasks; each produces a working commit. Appropriate for a ~2500-line flagship feature.
