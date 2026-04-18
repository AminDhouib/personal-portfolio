# Super Voltorb Flip: Effects, Audio, Memo, Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Super Voltorb Flip port to match the reference game's full presentation — themeable explosion/sparkle animations on bomb/coin events, original HG/SS SFX and background music, a responsive layout that uses screen-space well on desktop and mobile, and a memo (flag) overlay ported from samualtnorman/voltorb-flip.

**Architecture:**
- **Effects registry** (`src/components/game/super-voltorb-flip/effects/`) exposing a themed map of React components: `{ onBombFlip, onCoinReveal, onWin, onLevelUp }`. The Gameboard subscribes to game events and renders the active theme's components as portals overlaying the grid. Default theme ports the HG/SS sprite animations; adding a new theme is a single file.
- **Audio module** (`super-voltorb-flip/audio.ts`) wrapping `new Audio()` with a `play(name)` API, an app-wide `useMute()` store (localStorage-persisted), and a one-time user-gesture unlock. Music uses a tiny intro→loop scheduler.
- **Responsive layout**: replace the single vertical stack with CSS grid that places (scoreboard + memo button) on the left column and (GameInfo + Gameboard) on the right at `md:` breakpoint, stacks vertically below that. Gameboard itself uses `aspect-square` with viewport-based max-width so it scales down without breaking the tile grid.
- **Memo mode** ports samualtnorman's flag model: each cell gets `{ flag1, flag2, flag3, flagV }` booleans, a single toggle button opens memo mode, and clicking a tile while memo-mode is on flips ONE flag (cycling through 1/2/3/V via sub-buttons) instead of revealing.

**Tech Stack:** React 19, TypeScript, framer-motion (effect components), WebAudio via `<audio>` elements, Tailwind v4 responsive classes, samualtnorman's PNG sprite assets (explosion, memo, success, music).

---

## Asset Prep (Task 0)

All assets pulled into `public/games/super-voltorb-flip/sprites/upstream/`. No code — just `curl` from samualtnorman's `main` into mirrored paths.

**Files:**
- Create: `public/games/super-voltorb-flip/sprites/upstream/tile/explode_[0-8].png`
- Create: `public/games/super-voltorb-flip/sprites/upstream/tile/flip_[0-1].png`
- Create: `public/games/super-voltorb-flip/sprites/upstream/tile/hover.png`
- Create: `public/games/super-voltorb-flip/sprites/upstream/success_[0-3].png`
- Create: `public/games/super-voltorb-flip/sprites/upstream/memo/[0-3].png`, `frame.png`, `hover.png`, `press.png`
- Create: `public/games/super-voltorb-flip/sprites/upstream/button/memo/{0-3}_{off,on}.png`, `close.png`, `close_press.png`, `hover.png`, `open.png`, `open_press.png`, `s_{off,on}.png`
- Create: `public/games/super-voltorb-flip/audio/music_intro.mp3`, `music_loop.mp3`

- [ ] **Step 1: Fetch sprite bundle**

```bash
BASE="public/games/super-voltorb-flip/sprites/upstream"
UP="https://raw.githubusercontent.com/samualtnorman/voltorb-flip/main/src/assets"
mkdir -p "$BASE/tile" "$BASE/memo" "$BASE/button/memo" "public/games/super-voltorb-flip/audio"
for i in 0 1 2 3 4 5 6 7 8; do curl -sSL -o "$BASE/tile/explode_$i.png" "$UP/tile/explode_$i.png"; done
for i in 0 1; do curl -sSL -o "$BASE/tile/flip_$i.png" "$UP/tile/flip_$i.png"; done
curl -sSL -o "$BASE/tile/hover.png" "$UP/tile/hover.png"
for i in 0 1 2 3; do
  curl -sSL -o "$BASE/success_$i.png" "$UP/success_$i.png"
  curl -sSL -o "$BASE/memo/$i.png" "$UP/memo/$i.png"
  curl -sSL -o "$BASE/button/memo/${i}_off.png" "$UP/button/memo/${i}_off.png"
  curl -sSL -o "$BASE/button/memo/${i}_on.png" "$UP/button/memo/${i}_on.png"
done
curl -sSL -o "$BASE/memo/frame.png"  "$UP/memo/frame.png"
curl -sSL -o "$BASE/memo/hover.png"  "$UP/memo/hover.png"
curl -sSL -o "$BASE/memo/press.png"  "$UP/memo/press.png"
curl -sSL -o "$BASE/button/memo/close.png"       "$UP/button/memo/close.png"
curl -sSL -o "$BASE/button/memo/close_press.png" "$UP/button/memo/close_press.png"
curl -sSL -o "$BASE/button/memo/hover.png"       "$UP/button/memo/hover.png"
curl -sSL -o "$BASE/button/memo/open.png"        "$UP/button/memo/open.png"
curl -sSL -o "$BASE/button/memo/open_press.png"  "$UP/button/memo/open_press.png"
curl -sSL -o "$BASE/button/memo/s_off.png"       "$UP/button/memo/s_off.png"
curl -sSL -o "$BASE/button/memo/s_on.png"        "$UP/button/memo/s_on.png"
curl -sSL -o "public/games/super-voltorb-flip/audio/music_intro.mp3" "$UP/music_intro.mp3"
curl -sSL -o "public/games/super-voltorb-flip/audio/music_loop.mp3"  "$UP/music_loop.mp3"
```

- [ ] **Step 2: Verify download**

Run: `ls -la public/games/super-voltorb-flip/sprites/upstream/tile/`
Expected: 9 explode_*.png + 2 flip_*.png + hover.png (12 files, ~1.5KB each)

- [ ] **Step 3: Commit**

```bash
git add public/games/super-voltorb-flip/sprites/upstream public/games/super-voltorb-flip/audio
git commit -m "assets(voltorb): mirror samualtnorman sprite+music assets for upcoming effects/memo/audio"
```

---

## Task 1: Effects registry scaffold

**Files:**
- Create: `src/components/game/super-voltorb-flip/effects/index.ts` — registry + theme type
- Create: `src/components/game/super-voltorb-flip/effects/default.tsx` — upstream HG/SS theme
- Create: `src/components/game/super-voltorb-flip/effects/context.tsx` — React context + `useEffects()`

- [ ] **Step 1: Define the theme shape**

```ts
// src/components/game/super-voltorb-flip/effects/index.ts
import type { ComponentType } from "react";

export type EffectProps = {
  row: number;
  col: number;
  onDone: () => void;
};

export type EffectTheme = {
  name: string;
  BombFlip: ComponentType<EffectProps>;
  CoinReveal: ComponentType<EffectProps>;
  Win: ComponentType<{ onDone: () => void }>;
};

export const themes: Record<string, () => Promise<EffectTheme>> = {
  default: async () => (await import("./default")).theme,
};
```

- [ ] **Step 2: Write the HG/SS default theme**

```tsx
// src/components/game/super-voltorb-flip/effects/default.tsx
"use client";
import { useEffect, useState } from "react";
import type { EffectProps, EffectTheme } from ".";

const EXPLODE_FRAMES = Array.from(
  { length: 9 },
  (_, i) => `/games/super-voltorb-flip/sprites/upstream/tile/explode_${i}.png`,
);

function ExplosionSprite({ onDone }: EffectProps) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (frame === EXPLODE_FRAMES.length - 1) {
      const t = setTimeout(onDone, 80);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setFrame((f) => f + 1), 60);
    return () => clearTimeout(t);
  }, [frame, onDone]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={EXPLODE_FRAMES[frame]}
      width={40}
      height={40}
      alt=""
      style={{ imageRendering: "pixelated", pointerEvents: "none" }}
    />
  );
}

const SUCCESS_FRAMES = Array.from(
  { length: 4 },
  (_, i) => `/games/super-voltorb-flip/sprites/upstream/success_${i}.png`,
);

function SparkleSprite({ onDone }: EffectProps) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (frame === SUCCESS_FRAMES.length - 1) {
      const t = setTimeout(onDone, 100);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setFrame((f) => f + 1), 80);
    return () => clearTimeout(t);
  }, [frame, onDone]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SUCCESS_FRAMES[frame]}
      width={40}
      height={40}
      alt=""
      style={{ imageRendering: "pixelated", pointerEvents: "none" }}
    />
  );
}

function WinOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-4xl font-black text-yellow-300">
      Level Cleared!
    </div>
  );
}

export const theme: EffectTheme = {
  name: "default",
  BombFlip: ExplosionSprite,
  CoinReveal: SparkleSprite,
  Win: WinOverlay,
};
```

- [ ] **Step 3: Provide the theme via context**

```tsx
// src/components/game/super-voltorb-flip/effects/context.tsx
"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { EffectTheme } from ".";
import { themes } from ".";

const EffectsCtx = createContext<EffectTheme | null>(null);

export function EffectsProvider({ themeName = "default", children }: { themeName?: string; children: ReactNode }) {
  const [theme, setTheme] = useState<EffectTheme | null>(null);
  useEffect(() => {
    themes[themeName]?.().then(setTheme);
  }, [themeName]);
  if (!theme) return <>{children}</>;
  return <EffectsCtx.Provider value={theme}>{children}</EffectsCtx.Provider>;
}

export function useEffectsTheme(): EffectTheme | null {
  return useContext(EffectsCtx);
}
```

- [ ] **Step 4: Hook Gameboard — render active effects**

In `super-voltorb-flip.tsx` `Gameboard`, add:

```tsx
type ActiveEffect = { id: number; kind: "bomb" | "coin"; row: number; col: number };

const [effects, setEffects] = useState<ActiveEffect[]>([]);
const theme = useEffectsTheme();
const nextId = useRef(0);

function handleFlip(row: number, col: number) {
  updateGame((g) => {
    const cell = g.cells[row][col];
    if (!cell.isFlipped) {
      const kind = cell.value === "V" ? "bomb" : cell.value > 1 ? "coin" : null;
      if (kind) {
        const id = nextId.current++;
        setEffects((prev) => [...prev, { id, kind, row, col }]);
      }
    }
    g.flipCell(row, col);
  });
}
```

And at the bottom of the Gameboard JSX:

```tsx
{theme && effects.map((e) => {
  const Comp = e.kind === "bomb" ? theme.BombFlip : theme.CoinReveal;
  return (
    <div key={e.id} className="pointer-events-none absolute" style={{
      left: `calc(${e.col} * (40px + 16px))`,
      top:  `calc(${e.row} * (40px + 16px))`,
      zIndex: 20,
    }}>
      <Comp row={e.row} col={e.col} onDone={() => setEffects((prev) => prev.filter((x) => x.id !== e.id))} />
    </div>
  );
})}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/game/super-voltorb-flip src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb): themeable effects registry + HG/SS explosion/sparkle default"
```

---

## Task 2: Audio module + SFX hooks

**Files:**
- Create: `src/components/game/super-voltorb-flip/audio.ts`
- Create: `src/components/game/super-voltorb-flip/use-mute.ts`
- Modify: `src/components/game/super-voltorb-flip.tsx` (hook SFX into flip/win/lose)

- [ ] **Step 1: Synth SFX module (no external deps)**

Upstream games use WebAudio-generated tones for click/coin/boom when no SFX asset is available. Keep it tiny:

```ts
// src/components/game/super-voltorb-flip/audio.ts
let ctx: AudioContext | null = null;
let music: HTMLAudioElement | null = null;
let explosion: HTMLAudioElement | null = null;

function ensureCtx() {
  if (!ctx && typeof window !== "undefined") ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

function beep(freq: number, dur = 0.09, type: OscillatorType = "square", gain = 0.04) {
  const c = ensureCtx(); if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type; osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
}

export const sfx = {
  click: () => beep(740, 0.05, "square"),
  coin:  () => { beep(988, 0.08); setTimeout(() => beep(1319, 0.1), 60); },
  win:   () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.15, "triangle"), i * 90)); },
  lose:  () => {
    // rumble: noise burst via OfflineAudioBuffer
    const c = ensureCtx(); if (!c) return;
    const buf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.5;
    const src = c.createBufferSource();
    src.buffer = buf; src.connect(c.destination); src.start();
  },
};

export function playMusic() {
  if (music) return;
  music = new Audio("/games/super-voltorb-flip/audio/music_loop.mp3");
  music.loop = true; music.volume = 0.3; music.play().catch(() => {});
}

export function stopMusic() { music?.pause(); music = null; }
```

- [ ] **Step 2: Mute toggle hook**

```ts
// src/components/game/super-voltorb-flip/use-mute.ts
"use client";
import { useEffect, useState } from "react";

const KEY = "svf:muted";

export function useMute() {
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setMuted(localStorage.getItem(KEY) === "1");
  }, []);
  const toggle = () => {
    const next = !muted;
    setMuted(next);
    if (typeof window !== "undefined") localStorage.setItem(KEY, next ? "1" : "0");
  };
  return [muted, toggle] as const;
}
```

- [ ] **Step 3: Wire into game events**

In `useGame` / `Gameboard`, wrap each `updateGame` side effect with a mute check:

```ts
import { sfx, playMusic } from "./super-voltorb-flip/audio";
...
function handleFlip(row, col) {
  updateGame((g) => {
    const cell = g.cells[row][col];
    if (!cell.isFlipped) {
      if (!muted) {
        if (cell.value === "V") sfx.lose();
        else if (cell.value > 1) sfx.coin();
        else sfx.click();
      }
    }
    g.flipCell(row, col);
  });
}
```

Add `playMusic()` after the first user gesture (e.g. first tile click) behind a `musicStarted` flag.

- [ ] **Step 4: Mute button in scoreboard strip**

Add a small `<button>` with a speaker-on / speaker-off SVG next to the total-coins display. Updates `muted` state.

- [ ] **Step 5: Commit**

```bash
git add src/components/game
git commit -m "feat(voltorb): synth SFX + background music (HG/SS loop) with mute toggle"
```

---

## Task 3: Responsive layout

**Files:**
- Modify: `src/components/game/super-voltorb-flip.tsx` (root layout, Gameboard sizing)

- [ ] **Step 1: Root becomes CSS grid**

```tsx
// replace existing SuperVoltorbFlipGame return body
<div className={`svf-root ... grid gap-4 md:grid-cols-[auto,1fr] md:items-start`}>
  <style>{SCOPED_STYLES}</style>
  <div className="flex flex-col items-center gap-2 md:items-stretch">
    <InstructionsBtns />
    {game && <Scoreboard currentScore={game.currentScore} totalScore={game.totalScore} />}
    {/* MemoPanel lives here (Task 4) */}
  </div>
  <div className="flex flex-col items-center gap-2">
    {game && <GameInfo currentLevel={game.currentLevel} />}
    {game && (
      <Gameboard
        game={game}
        updateGame={updateGame}
        waitForClick
      />
    )}
    <Footer />
  </div>
</div>
```

- [ ] **Step 2: Gameboard fluid width**

Change the outer wrapper to use `aspect-square max-w-[min(90vw,440px)] w-full` instead of the fixed `h-96 w-full`. Internal `grid-cols-5` + `gap-4` scales with container because its cells are defined in px currently — convert to using CSS custom prop for the tile-unit so it can shrink:

```css
.svf-root {
  --svf-tile: 40px;
  --svf-gap: 16px;
}
@media (max-width: 479px) {
  .svf-root { --svf-tile: 34px; --svf-gap: 12px; }
}
```

Then replace `h-10 w-10` in tiles with `h-[var(--svf-tile)] w-[var(--svf-tile)]` (arbitrary values). Same for RowColCard → `h-[var(--svf-tile)]` (or keep slightly bigger). Grid `gap-4` → `gap-[var(--svf-gap)]`. Connector `right:-17px` math must be re-expressed in the CSS, not hardcoded — see step 3.

- [ ] **Step 3: Connector geometry uses `--svf-gap`**

```css
.svf-root .svf-conn-e {
  right: calc(-1 * var(--svf-gap) - 1px);
  width: calc(var(--svf-gap) + 2px);
  /* rest unchanged */
}
.svf-root .svf-conn-s {
  bottom: calc(-1 * var(--svf-gap) - 1px);
  height: calc(var(--svf-gap) + 2px);
  /* rest unchanged */
}
```

- [ ] **Step 4: Verify with Chrome DevTools responsive mode**

Emulate: 360×640 (mobile), 768×1024 (tablet), 1440×900 (desktop). Check: tiles shrink without clipping, row-clue cards still align with their rows (gap rhythm intact), connectors still land in gap.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb): responsive layout — left score column + fluid tile sizing via CSS vars"
```

---

## Task 4: Memo mode

**Files:**
- Modify: `src/components/game/super-voltorb-flip.tsx` (Board, Card, Gameboard signatures + memo state)
- Create: `src/components/game/super-voltorb-flip/memo-button.tsx`

The upstream `Cell` already has `flags: { 1: false, 2: false, 3: false, V: false }` and Board has `flagCell`. samualtnorman draws memo icons in each tile's four quadrants.

- [ ] **Step 1: Memo state + toggle**

In `SuperVoltorbFlipGame`:

```tsx
const [memoMode, setMemoMode] = useState(false);
const [memoFlag, setMemoFlag] = useState<1 | 2 | 3 | "V">(1);
```

Pass `memoMode`, `memoFlag` down through `Gameboard` → `Card`.

- [ ] **Step 2: MemoPanel component**

Render in the left column:

```tsx
// memo-button.tsx
export function MemoPanel({ mode, flag, onToggleMode, onFlagChange }: {...}) {
  return (
    <div className={`svf-memo-panel ${mode ? "svf-memo-open" : ""}`}>
      <button onClick={onToggleMode} aria-pressed={mode}>
        <img src={`/games/super-voltorb-flip/sprites/upstream/button/memo/${mode ? "close" : "open"}.png`}
             width={60} height={60} alt={mode ? "Close Memo" : "Open Memo"}
             style={{ imageRendering: "pixelated" }} />
      </button>
      {mode && (
        <div className="mt-2 flex gap-1">
          {([1, 2, 3, "V"] as const).map((f) => (
            <button key={f} onClick={() => onFlagChange(f)} aria-pressed={flag === f}>
              <img src={`/games/super-voltorb-flip/sprites/upstream/button/memo/${f === "V" ? "s" : f - 1}_${flag === f ? "on" : "off"}.png`}
                   width={36} height={36} alt={`Memo ${f}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Card renders memo flags**

Inside the Card face-down branch, after the checker back, overlay per-flag icons:

```tsx
{flags && (
  <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 pointer-events-none">
    {([1, 2, 3, "V"] as const).map((f, i) => flags[f] ? (
      <img key={f}
           src={`/games/super-voltorb-flip/sprites/upstream/memo/${f === "V" ? 0 : f}.png`}
           width={16} height={16} alt="" style={{imageRendering:"pixelated"}}
           className={i === 0 ? "place-self-start" : i === 1 ? "place-self-end" : i === 2 ? "place-self-start self-end" : "place-self-end"} />
    ) : null)}
  </div>
)}
```

- [ ] **Step 4: Click handler branches on memoMode**

```ts
function handleFlip(row: number, col: number) {
  updateGame((g) => {
    if (memoMode) g.flagCell(row, col, memoFlag);
    else g.flipCell(row, col);
  });
}
```

`g.flagCell` already exists on the VoltorbFlip class (delegated to Board). Verify the public method exists or add `flagCell(r,c,f) { this._board.flagCell(r,c,f); }`.

- [ ] **Step 5: Commit**

```bash
git add src/components/game
git commit -m "feat(voltorb): memo mode — quadrant flag overlay + memo button panel (ported from samualtnorman)"
```

---

## Task 5: QOL / small wins

Small, isolated polish items. Each is its own commit.

- [ ] **Keyboard navigation** — arrow keys move the red cursor, `Space`/`Enter` flips. Trap focus within the board when it's the active surface. Add `tabIndex=0` on each tile wrapper and `aria-label="Row 3, Col 2, face down"`.
- [ ] **Confetti on level clear** — reuse the effect registry with a `LevelClear` component that burst-positions success sprites across the board for ~1.4s. Ties into Task 1.
- [ ] **Coin ticker animation** — `Scoreboard` animates `00020 → 00025` via `motion.span` `count` on coin pickup.
- [ ] **Persist game progress** — write `{ currentLevel, totalScore }` to localStorage so refresh resumes.
- [ ] **Pause/resume when tab hidden** — `visibilitychange` → pause music + SFX, resume on focus.
- [ ] **Reduced-motion honor** — `@media (prefers-reduced-motion: reduce)` disables the explosion frames (swap for an instant flash) and shortens the flip duration to 150ms.
- [ ] **Mute button in left column** (if not already in Task 2).

Each is < 30 lines, commit individually with `polish(voltorb): ...` messages.

---

## Self-Review Checklist

- [ ] All assets mirrored to `public/games/super-voltorb-flip/` (no cross-origin loads, so they work with Next's static serving).
- [ ] Effects registry is pure-exports — new theme = new file, zero changes elsewhere.
- [ ] Audio module guards against SSR (`typeof window`).
- [ ] Memo mode does not crash when `waitForClick` triggers a full re-flip (flags should clear on restart, verify `restartGame` zeroes them).
- [ ] Responsive: gameboard stays usable down to 360px wide.
- [ ] No new ESLint errors from `@next/next/no-img-element` — add eslint-disable comments where raw `<img>` is used for pixel assets.
- [ ] Memo panel's click handler does NOT also trigger a tile flip (stop propagation or re-check `if (memoMode) return`).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-voltorb-effects-audio-memo.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
