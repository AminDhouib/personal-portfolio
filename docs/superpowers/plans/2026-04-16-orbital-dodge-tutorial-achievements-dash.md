# Orbital Dodge — Tutorial, Achievements & Dash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the retention + mastery gap. Add: (a) a 15-second scripted onboarding tutorial for first-time players, (b) an achievement system with cosmetic unlocks tracked cumulatively across runs, (c) a dash / barrel-roll skill move that experienced players can use to weave through obstacles with brief invulnerability.

**Architecture:** Three loosely-coupled systems sharing the Profile schema. Tutorial is a scripted finite-state machine gated by `profile.tutorialComplete`. Achievements live in a static catalog file; progress checks run on relevant gameplay events (death, boss defeat, coin pickup) against profile counters. Dash is a new ship ability: double-tap left/right triggers a 300ms invulnerable lateral slide with visual afterimage. Achievements unlock cosmetics (Plan 3 items) — hook via `profile.ownedCosmetics`.

**Tech Stack:** TypeScript, React 19, `@react-three/fiber`, Three.js, Framer Motion (existing). No new deps.

---

## Context for the implementing engineer

This plan has soft dependencies on earlier plans:

- **Plan 2 (shop foundation) is hard-required** — tutorial references the profile module (`loadProfile`, `markFirstRunCompleted`), and achievement progress reads/writes `profile` counters. If Plan 2 hasn't shipped, ship it first.
- **Plan 3 (shop phase 2)** is soft-required — achievements unlock cosmetics defined in Plan 3's catalog. If Plan 3 hasn't shipped, achievements still work, they just don't grant unlocks. Gate the unlock code with a try/catch (`require('./cosmetics')`).
- **Plans 1 (combo), 4 (bosses), 5 (polish)** are independent — tutorial mentions combos only if Plan 1 is shipped; boss achievements are no-op if Plan 4 isn't shipped. Write the code gracefully: count combo peak only if the field exists, etc.

Don't implement features from other plans. If something here requires a module that doesn't yet exist, code around it defensively.

**Where to write code:**
- `src/components/game/space-shooter.tsx` — tutorial FSM, dash input, achievement event hooks, all UI overlays
- **Create:** `src/components/game/achievements.ts` — static catalog + progress helpers
- **Create:** `src/components/game/tutorial.ts` — tutorial step definitions

**Testing:** Manual verification via Chrome DevTools MCP. Clear localStorage to test first-timer flow.

---

## File structure

- **Create:** `src/components/game/tutorial.ts` — scripted tutorial step list + state type
- **Create:** `src/components/game/achievements.ts` — catalog of ~20 achievements + `checkProgress(profile, gameState)` helper
- **Modify:** `src/components/game/space-shooter.tsx` — integrate all three systems: tutorial FSM overlay, achievement toast UI, dash input + effect
- **(Conditional) Modify:** `src/components/game/profile.ts` — the schema already has `unlockedAchievements` and `tutorialComplete`; no changes needed if Plan 2 shipped. Add a helper `unlockAchievement(id)` if not already present.

---

## Acceptance criteria

When this plan is complete:

1. A brand-new visitor (cleared localStorage) sees a scripted 15-second tutorial on first play that teaches: move, shoot (auto), dodge, dash, combo.
2. After tutorial completes (or is skipped), `profile.tutorialComplete = true` and it never runs again.
3. ~20 achievements live in a catalog; each has icon, name, description, and a check function.
4. When player performs a qualifying action (e.g., reach 100 combo), a toast slides in from the right for 3 seconds: "🏆 Combo Master" with the icon.
5. Achievements persist in `profile.unlockedAchievements` and show in a grid in the shop UI under a new "Achievements" tab.
6. Double-tapping A/D (or left/right arrow) within 300ms triggers a dash: ship snaps ~3 units left/right, leaves a ghost afterimage, has 300ms of invulnerability.
7. Dash has a 2-second cooldown; HUD shows a small cooldown indicator.
8. Some achievements unlock cosmetics (e.g., "Defeat 10 Bosses" unlocks "Boss Slayer" hull color). These are auto-added to `profile.ownedCosmetics`.
9. Nothing breaks for players with existing profiles (`tutorialComplete: true`, `unlockedAchievements: []`).

---

## Task 1: Tutorial catalog + types

**Files:**
- Create: `src/components/game/tutorial.ts`

- [ ] **Step 1: Define types**

```typescript
export type TutorialStepId =
  | "welcome"
  | "move"
  | "shoot"
  | "dodge"
  | "dash"
  | "combo"
  | "done";

export interface TutorialStep {
  id: TutorialStepId;
  durationMs: number;
  headline: string;
  subtext: string;
  waitForInput?: "move" | "dodge" | "dash" | null;
  // Scripted actions to apply while this step is active:
  scripted?: {
    // Force-spawn asteroid at a specific spot (for "dodge" step)
    forceObstacleSpawn?: { xOffset: number; delayMs: number };
    // Pause normal spawning so the tutorial isn't drowned
    pauseObstacles: boolean;
  };
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    durationMs: 2000,
    headline: "ORBITAL DODGE",
    subtext: "Survive as long as you can.",
    scripted: { pauseObstacles: true },
  },
  {
    id: "move",
    durationMs: 3000,
    headline: "Move",
    subtext: "WASD or mouse (or tilt your phone).",
    waitForInput: "move",
    scripted: { pauseObstacles: true },
  },
  {
    id: "shoot",
    durationMs: 2500,
    headline: "Fire Auto-Lock",
    subtext: "Your ship targets closest asteroids automatically.",
    scripted: { pauseObstacles: false },
  },
  {
    id: "dodge",
    durationMs: 3000,
    headline: "Dodge what you can't shoot",
    subtext: "Some walls are bullet-immune. Move out of the way.",
    waitForInput: "dodge",
    scripted: {
      pauseObstacles: false,
      forceObstacleSpawn: { xOffset: 0, delayMs: 500 },
    },
  },
  {
    id: "dash",
    durationMs: 3500,
    headline: "Dash",
    subtext: "Double-tap A or D for a quick invulnerable dash.",
    waitForInput: "dash",
    scripted: { pauseObstacles: true },
  },
  {
    id: "combo",
    durationMs: 3000,
    headline: "Chain kills for a combo multiplier",
    subtext: "Kills in quick succession multiply your score.",
    scripted: { pauseObstacles: false },
  },
  {
    id: "done",
    durationMs: 1500,
    headline: "GOOD LUCK, PILOT",
    subtext: "",
    scripted: { pauseObstacles: false },
  },
];

export interface TutorialState {
  active: boolean;
  stepIdx: number;
  stepStartAt: number;
  inputSatisfied: boolean;
}

export function newTutorialState(): TutorialState {
  return {
    active: false,
    stepIdx: 0,
    stepStartAt: 0,
    inputSatisfied: false,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/tutorial.ts
git commit -m "feat(orbital-dodge): tutorial step catalog and state types"
```

---

## Task 2: Tutorial FSM integration

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [ ] **Step 1: Import + init**

At top:

```typescript
import { TUTORIAL_STEPS, newTutorialState, type TutorialState } from "./tutorial";
import { loadProfile, saveProfile, markTutorialComplete } from "./profile";
```

(Add `markTutorialComplete` helper to `profile.ts` if missing:

```typescript
export function markTutorialComplete(): void {
  const p = loadProfile();
  p.tutorialComplete = true;
  saveProfile(p);
}
```
)

Add to GameRefs:

```typescript
tutorial: TutorialState;
```

Init:

```typescript
refs.current.tutorial = newTutorialState();
```

- [ ] **Step 2: Start tutorial for first-timers**

In the game-start path (where status goes from `idle` → `playing`):

```typescript
const profile = loadProfile();
if (!profile.tutorialComplete) {
  refs.current.tutorial.active = true;
  refs.current.tutorial.stepIdx = 0;
  refs.current.tutorial.stepStartAt = performance.now();
  refs.current.tutorial.inputSatisfied = false;
}
```

- [ ] **Step 3: Tutorial step advancement**

In the main tick, after other state updates:

```typescript
function updateTutorial(state: GameRefs, now: number): void {
  const t = state.tutorial;
  if (!t.active) return;
  const step = TUTORIAL_STEPS[t.stepIdx];
  const age = now - t.stepStartAt;

  // Scripted obstacle spawn
  if (step.scripted?.forceObstacleSpawn && age >= step.scripted.forceObstacleSpawn.delayMs) {
    // Check a one-time flag to avoid repeat spawns
    if (!(t as any).forcedSpawnDone) {
      spawnObstacleAt(state, step.scripted.forceObstacleSpawn.xOffset);
      (t as any).forcedSpawnDone = true;
    }
  }

  // Pause obstacle spawning if step requires
  if (step.scripted?.pauseObstacles) {
    state.normalSpawningPausedUntil = now + 100;
  }

  // Advance
  const inputWaitDone = !step.waitForInput || t.inputSatisfied;
  if (age >= step.durationMs && inputWaitDone) {
    t.stepIdx += 1;
    t.stepStartAt = now;
    t.inputSatisfied = false;
    (t as any).forcedSpawnDone = false;
    if (t.stepIdx >= TUTORIAL_STEPS.length) {
      t.active = false;
      markTutorialComplete();
    }
  }
}
```

Call `updateTutorial(refs.current, now)` in the tick.

Add helper `spawnObstacleAt(state, xOffset)` that creates a normal obstacle ahead of the ship at the given x. Reuse the existing `spawnObstacle` function if available.

- [ ] **Step 4: Mark input satisfied**

Find the existing input handlers. When player first moves during the `move` step, set:

```typescript
if (refs.current.tutorial.active) {
  const stepId = TUTORIAL_STEPS[refs.current.tutorial.stepIdx].id;
  if (stepId === "move" && (keys.a || keys.d || keys.w || keys.s)) {
    refs.current.tutorial.inputSatisfied = true;
  }
}
```

Similarly for dash step (after Task 7 ships dash), hook `inputSatisfied = true` on dash trigger. For dodge, mark satisfied when the forced asteroid passes the ship without collision — check inside the obstacle update loop.

- [ ] **Step 5: Tutorial overlay UI**

```tsx
{refs.current.tutorial.active && (() => {
  const step = TUTORIAL_STEPS[refs.current.tutorial.stepIdx];
  if (!step) return null;
  return (
    <div className="absolute inset-x-0 top-[20%] flex flex-col items-center pointer-events-none z-30">
      <div className="bg-black/70 backdrop-blur-sm border border-white/20 rounded-lg px-6 py-4 max-w-md text-center">
        <div className="text-xl sm:text-2xl font-bold text-white mb-1">{step.headline}</div>
        <div className="text-sm text-slate-300">{step.subtext}</div>
        {step.waitForInput && !refs.current.tutorial.inputSatisfied && (
          <div className="text-xs text-emerald-400 mt-2 animate-pulse">
            (waiting for input…)
          </div>
        )}
      </div>
    </div>
  );
})()}
```

- [ ] **Step 6: Skip button**

```tsx
{refs.current.tutorial.active && (
  <button
    onClick={() => {
      refs.current.tutorial.active = false;
      markTutorialComplete();
    }}
    className="absolute bottom-4 right-4 text-xs text-slate-400 hover:text-white px-3 py-1 bg-black/40 rounded border border-white/10 z-30"
  >
    Skip Tutorial
  </button>
)}
```

- [ ] **Step 7: Manual verification**

1. Clear localStorage.
2. Start game. Tutorial step "welcome" shows for 2s.
3. "Move" step shows; moving clears it (after min 3s, but input-gated).
4. "Shoot" plays; auto-lock visible against spawning asteroids.
5. "Dodge" step: an asteroid spawns ahead; tutorial says dodge; passing it triggers advancement.
6. "Dash" step: prompts double-tap (will no-op until Task 7 implements dash; keep advancement time-based for now — `waitForInput: null` until dash ships).
7. "Combo" step then "done" step.
8. On completion, `profile.tutorialComplete === true`. Reload page, tutorial does NOT run again.
9. Click "Skip Tutorial" mid-flow — same persistence behavior.

- [ ] **Step 8: Commit**

```bash
git add src/components/game/space-shooter.tsx src/components/game/profile.ts
git commit -m "feat(orbital-dodge): scripted 15s tutorial FSM with persistence"
```

---

## Task 3: Dash mechanic

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [ ] **Step 1: Dash state**

Add to GameRefs:

```typescript
dash: {
  lastLeftTapAt: number;
  lastRightTapAt: number;
  activeUntil: number;   // timestamp ms; 0 = inactive
  direction: "left" | "right" | null;
  cooldownUntil: number;
  startedAt: number;
  startX: number;
  targetX: number;
};
```

Init:

```typescript
refs.current.dash = {
  lastLeftTapAt: 0,
  lastRightTapAt: 0,
  activeUntil: 0,
  direction: null,
  cooldownUntil: 0,
  startedAt: 0,
  startX: 0,
  targetX: 0,
};
```

- [ ] **Step 2: Double-tap detection in input handler**

In the keydown handler:

```typescript
function tryDash(state: GameRefs, direction: "left" | "right", now: number): void {
  const DASH_WINDOW = 300;
  const DASH_COOLDOWN = 2000;
  const DASH_DURATION = 300;
  const DASH_DISTANCE = 3.0;

  if (now < state.dash.cooldownUntil) return;
  const lastTapKey = direction === "left" ? "lastLeftTapAt" : "lastRightTapAt";
  const lastTap = state.dash[lastTapKey];
  if (now - lastTap <= DASH_WINDOW && lastTap > 0) {
    // Trigger dash
    state.dash.activeUntil = now + DASH_DURATION;
    state.dash.direction = direction;
    state.dash.startedAt = now;
    state.dash.startX = state.ship.position[0];
    state.dash.targetX = state.ship.position[0] + (direction === "left" ? -DASH_DISTANCE : DASH_DISTANCE);
    state.dash.cooldownUntil = now + DASH_COOLDOWN;
    state.dash[lastTapKey] = 0;

    // Mark tutorial input satisfied
    if (state.tutorial.active) {
      const step = TUTORIAL_STEPS[state.tutorial.stepIdx];
      if (step.id === "dash") state.tutorial.inputSatisfied = true;
    }

    // SFX
    playSfx(state, () => playDashSfx(state.audioCtx, state.audioCtx?.currentTime ?? 0));
  } else {
    state[lastTapKey === "lastLeftTapAt" ? "dash" : "dash"][lastTapKey] = now;
    // (cleaner form below)
    state.dash[lastTapKey] = now;
  }
}
```

Wire into keydown:

```typescript
if (e.key === "a" || e.key === "ArrowLeft") {
  tryDash(refs.current, "left", performance.now());
}
if (e.key === "d" || e.key === "ArrowRight") {
  tryDash(refs.current, "right", performance.now());
}
```

- [ ] **Step 3: Dash SFX**

```typescript
function playDashSfx(ctx: AudioContext | null, t: number): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(800, t);
  osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);
  gain.gain.setValueAtTime(0.15, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.25);
}
```

- [ ] **Step 4: Dash physics in tick**

In the ship movement section, before computing the final ship X:

```typescript
if (now < refs.current.dash.activeUntil) {
  // During dash: override X lerp with a fast interpolation
  const progress = (now - refs.current.dash.startedAt) / 300;
  const eased = 1 - Math.pow(1 - Math.min(1, progress), 3);
  refs.current.ship.position[0] = refs.current.dash.startX + (refs.current.dash.targetX - refs.current.dash.startX) * eased;
  // Ship gets "invulnerable" flag
  refs.current.ship.invulnerableUntil = Math.max(refs.current.ship.invulnerableUntil ?? 0, refs.current.dash.activeUntil);
}
```

- [ ] **Step 5: Dash visual — afterimage trail**

Add afterimage state:

```typescript
refs.current.dashAfterimages: { pos: [number, number, number]; createdAt: number }[];
```

In tick during dash, every 30ms push current ship position:

```typescript
if (now < refs.current.dash.activeUntil && now - (refs.current.lastAfterimageAt ?? 0) > 30) {
  refs.current.dashAfterimages.push({
    pos: [...refs.current.ship.position] as [number, number, number],
    createdAt: now,
  });
  refs.current.lastAfterimageAt = now;
}
// Cull old ones (ttl 400ms)
refs.current.dashAfterimages = refs.current.dashAfterimages.filter((a) => now - a.createdAt < 400);
```

Render:

```tsx
{refs.current.dashAfterimages.map((a, i) => {
  const age = performance.now() - a.createdAt;
  const fade = 1 - age / 400;
  return (
    <mesh key={`ai-${i}-${a.createdAt}`} position={a.pos}>
      <sphereGeometry args={[0.4, 8, 8]} />
      <meshBasicMaterial color="#06b6d4" transparent opacity={fade * 0.5} />
    </mesh>
  );
})}
```

- [ ] **Step 6: Dash cooldown HUD indicator**

```tsx
{(() => {
  const now = performance.now();
  const cd = refs.current.dash?.cooldownUntil ?? 0;
  const onCd = now < cd;
  const pct = onCd ? Math.max(0, 1 - (cd - now) / 2000) : 1;
  return (
    <div className="absolute bottom-4 left-4 flex items-center gap-2 z-20">
      <div className="text-[10px] tracking-[0.2em] text-slate-400">DASH</div>
      <div className="w-16 h-1.5 bg-black/40 rounded overflow-hidden">
        <div
          className={`h-full transition-[width] duration-100 ${onCd ? "bg-slate-400" : "bg-cyan-400"}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
})()}
```

- [ ] **Step 7: Mobile swipe for dash**

Add a touchstart handler tracking left/right swipes:

```typescript
let touchStartX = 0;
let touchStartTime = 0;
canvas.addEventListener("touchstart", (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartTime = performance.now();
});
canvas.addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dt = performance.now() - touchStartTime;
  if (dt < 250 && Math.abs(dx) > 60) {
    tryDash(refs.current, dx < 0 ? "left" : "right", performance.now());
    tryDash(refs.current, dx < 0 ? "left" : "right", performance.now()); // double-call to satisfy double-tap
  }
});
```

(The double-call is a quick hack. Cleaner: add a `forceDash` parameter that bypasses double-tap detection.)

- [ ] **Step 8: Manual verification**

1. Desktop: Double-tap D quickly. Ship snaps ~3 units right; cyan afterimage fades; 2s cooldown visible in HUD.
2. Incoming asteroid + dash through it: ship takes no damage.
3. Mobile: swipe left quickly to dash left.
4. Tutorial dash step is satisfied after a dash.

- [ ] **Step 9: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): dash with double-tap input, afterimage, and cooldown"
```

---

## Task 4: Achievement catalog

**Files:**
- Create: `src/components/game/achievements.ts`

- [ ] **Step 1: Types + catalog**

```typescript
import type { Profile } from "./profile";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;       // emoji or path to SVG asset (user prefers no emojis — use short text labels instead)
  // Returns true if achieved.
  check: (profile: Profile, runStats: RunSnapshot) => boolean;
  // Cosmetic reward (optional)
  unlocksCosmeticId?: string;
}

export interface RunSnapshot {
  finalScore: number;
  finalDistance: number;
  finalCombo: number;
  asteroidsDestroyed: number;
  bossesDefeated: number;
  runSurvivalSeconds: number;
  // Per-run peaks
  peakCombo: number;
  coinsCollectedThisRun: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  // Beginner bundle
  { id: "first-death",       name: "Welcome, Pilot",     description: "Die for the first time.",      icon: "01", check: (p) => p.totalRunsPlayed >= 1 },
  { id: "first-100",         name: "Century",            description: "Score 100 points in a run.",   icon: "02", check: (_, r) => r.finalScore >= 100 },
  { id: "first-1k",          name: "Four Digits",        description: "Score 1,000 points in a run.", icon: "03", check: (_, r) => r.finalScore >= 1000 },
  { id: "first-10k",         name: "Five Figures",       description: "Score 10,000 points in a run.", icon: "04", check: (_, r) => r.finalScore >= 10000, unlocksCosmeticId: "hull-five-figures" },
  { id: "first-100k",        name: "Leaderboard Bound",  description: "Score 100,000 points in a run.", icon: "05", check: (_, r) => r.finalScore >= 100000, unlocksCosmeticId: "hull-leaderboard" },

  // Distance
  { id: "dist-1k",           name: "Explorer",           description: "Travel 1,000 meters.",         icon: "06", check: (_, r) => r.finalDistance >= 1000 },
  { id: "dist-5k",           name: "Deep Space",         description: "Travel 5,000 meters.",         icon: "07", check: (_, r) => r.finalDistance >= 5000 },
  { id: "dist-total-50k",    name: "Long Hauler",        description: "Travel 50,000m lifetime.",     icon: "08", check: (p) => p.totalDistance >= 50000, unlocksCosmeticId: "engine-long-haul" },

  // Combo
  { id: "combo-10",          name: "Rhythm",             description: "Reach a 10-kill combo.",       icon: "09", check: (_, r) => r.peakCombo >= 10 },
  { id: "combo-50",          name: "Combo Master",       description: "Reach a 50-kill combo.",       icon: "10", check: (_, r) => r.peakCombo >= 50, unlocksCosmeticId: "hull-combo-master" },
  { id: "combo-100",         name: "Untouchable",        description: "Reach a 100-kill combo.",      icon: "11", check: (_, r) => r.peakCombo >= 100, unlocksCosmeticId: "death-fx-untouchable" },

  // Kills
  { id: "kills-100",         name: "Sharpshooter",       description: "Destroy 100 asteroids.",       icon: "12", check: (_, r) => r.asteroidsDestroyed >= 100 },
  { id: "kills-total-10k",   name: "Ace",                description: "Destroy 10,000 asteroids lifetime.", icon: "13", check: (p) => p.totalAsteroidsDestroyed >= 10000 },

  // Bosses
  { id: "boss-first",        name: "Giant Killer",       description: "Defeat your first boss.",      icon: "14", check: (p) => p.totalBossesDefeated >= 1 },
  { id: "boss-5",            name: "Boss Rush",          description: "Defeat 5 bosses lifetime.",    icon: "15", check: (p) => p.totalBossesDefeated >= 5, unlocksCosmeticId: "hull-boss-rush" },
  { id: "boss-void",         name: "End of the Line",    description: "Defeat the Void Tyrant.",      icon: "16", check: (p) => !!(p as any).voidTyrantDefeated, unlocksCosmeticId: "ship-void" },

  // Economy
  { id: "coins-1k",          name: "Frugal",             description: "Collect 1,000 coins lifetime.", icon: "17", check: (p) => p.totalCoinsEarned >= 1000 },
  { id: "coins-10k",         name: "Wealthy",            description: "Collect 10,000 coins lifetime.", icon: "18", check: (p) => p.totalCoinsEarned >= 10000, unlocksCosmeticId: "engine-wealth" },

  // Skill
  { id: "dash-master",       name: "Nimble",             description: "Use dash 100 times lifetime.", icon: "19", check: (p) => ((p as any).totalDashes ?? 0) >= 100 },
  { id: "no-hit-run",        name: "Flawless",           description: "Survive 60s without taking damage.", icon: "20", check: (_, r) => r.runSurvivalSeconds >= 60 && (r as any).damageTakenThisRun === 0, unlocksCosmeticId: "hull-flawless" },
];

export function checkAchievements(profile: Profile, runStats: RunSnapshot): Achievement[] {
  const newly: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.unlockedAchievements.includes(a.id)) continue;
    if (a.check(profile, runStats)) {
      newly.push(a);
    }
  }
  return newly;
}
```

- [ ] **Step 2: Helper to save unlocks**

```typescript
import { loadProfile, saveProfile } from "./profile";

export function grantAchievements(achievements: Achievement[]): void {
  if (achievements.length === 0) return;
  const p = loadProfile();
  for (const a of achievements) {
    if (!p.unlockedAchievements.includes(a.id)) {
      p.unlockedAchievements.push(a.id);
      if (a.unlocksCosmeticId && !p.ownedCosmetics.includes(a.unlocksCosmeticId)) {
        p.ownedCosmetics.push(a.unlocksCosmeticId);
      }
    }
  }
  saveProfile(p);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/game/achievements.ts
git commit -m "feat(orbital-dodge): achievement catalog and grant helper"
```

---

## Task 5: Achievement evaluation on death

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [ ] **Step 1: Capture run snapshot at death**

Find the death transition (where status goes to `dying`). Before submitting to leaderboard, compute the snapshot and evaluate:

```typescript
import { checkAchievements, grantAchievements, type RunSnapshot } from "./achievements";

const runStats: RunSnapshot = {
  finalScore: refs.current.score,
  finalDistance: Math.floor(refs.current.distanceTraveled),
  finalCombo: refs.current.combo ?? 0,
  asteroidsDestroyed: refs.current.kills ?? 0,
  bossesDefeated: refs.current.bossesDefeatedThisRun ?? 0,
  runSurvivalSeconds: Math.floor((performance.now() - refs.current.runStartAt) / 1000),
  peakCombo: refs.current.comboPeak ?? 0,
  coinsCollectedThisRun: refs.current.coinsCollectedThisRun ?? 0,
};

// Before checking, make sure profile-level counters are updated.
const profile = loadProfile();
profile.totalRunsPlayed += 1;
profile.totalCoinsEarned += runStats.coinsCollectedThisRun;
profile.totalDistance += runStats.finalDistance;
profile.totalAsteroidsDestroyed += runStats.asteroidsDestroyed;
profile.totalBossesDefeated = (profile.totalBossesDefeated ?? 0) + runStats.bossesDefeated;
saveProfile(profile);

// Now evaluate
const newlyUnlocked = checkAchievements(profile, runStats);
grantAchievements(newlyUnlocked);

// Queue toasts
refs.current.pendingAchievementToasts = [...(refs.current.pendingAchievementToasts ?? []), ...newlyUnlocked];
```

Add `pendingAchievementToasts: Achievement[]` and `coinsCollectedThisRun: number` to GameRefs.

- [ ] **Step 2: Track coins-collected per run**

Wherever Coin is picked up (Plan 2 added coin pickup), increment:

```typescript
refs.current.coinsCollectedThisRun += coinValue;
```

Reset at run start to 0.

- [ ] **Step 3: Track damage-taken per run**

Add `damageTakenThisRun: number` to GameRefs. In `applyShipDamage`, increment. Achievement "no-hit-run" checks this is 0.

Pass it into runStats:

```typescript
(runStats as any).damageTakenThisRun = refs.current.damageTakenThisRun ?? 0;
```

- [ ] **Step 4: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): evaluate achievements and capture run stats on death"
```

---

## Task 6: Achievement toast UI

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [ ] **Step 1: Toast state**

```typescript
const [activeToasts, setActiveToasts] = useState<{ id: string; createdAt: number; name: string; description: string; icon: string }[]>([]);

// Poll refs for pending toasts
useEffect(() => {
  const interval = setInterval(() => {
    if (!refs.current.pendingAchievementToasts || refs.current.pendingAchievementToasts.length === 0) return;
    const next = refs.current.pendingAchievementToasts.shift()!;
    setActiveToasts((prev) => [...prev, {
      id: next.id,
      createdAt: Date.now(),
      name: next.name,
      description: next.description,
      icon: next.icon,
    }]);
  }, 300); // stagger new toasts
  return () => clearInterval(interval);
}, []);

// Expire after 3.5s
useEffect(() => {
  if (activeToasts.length === 0) return;
  const t = setInterval(() => {
    setActiveToasts((prev) => prev.filter((x) => Date.now() - x.createdAt < 3500));
  }, 200);
  return () => clearInterval(t);
}, [activeToasts.length]);
```

- [ ] **Step 2: Toast rendering**

```tsx
<div className="absolute top-16 right-4 flex flex-col gap-2 z-40 pointer-events-none">
  {activeToasts.map((toast) => (
    <div
      key={toast.id + toast.createdAt}
      className="flex items-center gap-3 bg-amber-900/80 backdrop-blur-sm border border-amber-400/50 rounded-lg px-4 py-2 min-w-[220px] animate-in slide-in-from-right duration-300"
    >
      <div className="flex items-center justify-center w-10 h-10 rounded bg-amber-400 text-amber-900 font-black text-sm">
        {toast.icon}
      </div>
      <div className="flex-1">
        <div className="text-xs text-amber-200 tracking-wide">ACHIEVEMENT</div>
        <div className="font-bold text-white text-sm">{toast.name}</div>
        <div className="text-xs text-amber-100">{toast.description}</div>
      </div>
    </div>
  ))}
</div>
```

If your Tailwind doesn't have `animate-in` (tailwindcss-animate), use a CSS keyframe or Framer Motion.

- [ ] **Step 3: Manual verification**

1. Clear localStorage.
2. Die after scoring 100. Toasts stack: "Welcome, Pilot" + "Century".
3. Each slides in from right, visible ~3s, fades.
4. Reload — toasts gone, achievements persisted.
5. Die again with score 100 — no repeat toast (already unlocked).

- [ ] **Step 4: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): achievement toast notifications on unlock"
```

---

## Task 7: Achievements tab in shop UI

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [ ] **Step 1: Add "Achievements" tab**

Find the shop UI (Plan 3 added tabbed UI). Add tab entry:

```typescript
const shopTabs = ["Upgrades", "Consumables", "Ships", "Cosmetics", "Achievements"];
```

- [ ] **Step 2: Achievements grid content**

```tsx
{activeShopTab === "Achievements" && (
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
    {ACHIEVEMENTS.map((a) => {
      const unlocked = profile.unlockedAchievements.includes(a.id);
      return (
        <div
          key={a.id}
          className={`p-3 rounded border ${
            unlocked ? "bg-amber-900/30 border-amber-500/50" : "bg-slate-800/50 border-slate-700/50"
          }`}
        >
          <div className="flex items-start gap-2">
            <div className={`w-8 h-8 flex items-center justify-center rounded font-black text-xs ${
              unlocked ? "bg-amber-400 text-amber-900" : "bg-slate-700 text-slate-500"
            }`}>
              {a.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-bold text-sm ${unlocked ? "text-white" : "text-slate-400"}`}>
                {a.name}
              </div>
              <div className="text-xs text-slate-400">{a.description}</div>
              {a.unlocksCosmeticId && unlocked && (
                <div className="text-[10px] text-emerald-400 mt-1">Unlocked: {a.unlocksCosmeticId}</div>
              )}
            </div>
          </div>
        </div>
      );
    })}
  </div>
)}
```

- [ ] **Step 3: Progress counter at tab header**

```tsx
<button onClick={() => setActiveShopTab("Achievements")}>
  Achievements ({profile.unlockedAchievements.length}/{ACHIEVEMENTS.length})
</button>
```

- [ ] **Step 4: Manual verification**

Open shop, click Achievements tab. Grid shows all achievements. Unlocked ones are highlighted in amber; locked are dim. Counter shows e.g. "4/20".

- [ ] **Step 5: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): achievements tab in shop with progress grid"
```

---

## Task 8: Cosmetic unlock propagation

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [ ] **Step 1: Verify cosmetics show up in Cosmetics tab**

When achievements grant cosmetics, they land in `profile.ownedCosmetics`. The Plan 3 Cosmetics tab should already filter to show owned + equippable. Verify no extra code needed.

If Plan 3 hasn't shipped: just keep the `ownedCosmetics` array growing; don't render it.

- [ ] **Step 2: Toast mentions cosmetic if present**

In the achievement toast, add a line:

```tsx
{achievement.unlocksCosmeticId && (
  <div className="text-xs text-emerald-300 mt-1">+ Cosmetic unlocked</div>
)}
```

(Requires passing `unlocksCosmeticId` through to the toast state.)

- [ ] **Step 3: Manual verification**

Reach 50 combo → "Combo Master" unlocks + "hull-combo-master" added to ownedCosmetics. Toast shows "+ Cosmetic unlocked". Open shop → Cosmetics tab → new hull appears as equippable.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): wire cosmetic unlocks from achievements"
```

---

## Task 9: Track lifetime dash count

**Files:**
- Modify: `src/components/game/space-shooter.tsx`, optionally `src/components/game/profile.ts`

- [ ] **Step 1: Increment `totalDashes` on each dash**

In `tryDash`, after the successful dash branch:

```typescript
try {
  const p = loadProfile();
  (p as any).totalDashes = ((p as any).totalDashes ?? 0) + 1;
  saveProfile(p);
} catch { /* noop */ }
```

The `(p as any)` cast is because `totalDashes` isn't in the v1 schema. Acceptable as an additive field for this plan; formalize in a future migration.

- [ ] **Step 2: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): track lifetime dash count in profile"
```

---

## Task 10: Tutorial respects dash step (once Task 3 dash ships)

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [ ] **Step 1: Re-enable `waitForInput: "dash"` on tutorial step**

Previously set to `null` in Task 2 Step 7 when dash didn't exist yet. Now switch back:

```typescript
// In tutorial.ts, the "dash" step:
{
  id: "dash",
  durationMs: 3500,
  headline: "Dash",
  subtext: "Double-tap A or D for a quick invulnerable dash.",
  waitForInput: "dash",
  scripted: { pauseObstacles: true },
},
```

Verify that the `inputSatisfied` hook from Task 3 fires.

- [ ] **Step 2: Manual verification**

Clear localStorage. Start game. Reach dash step. Double-tap D. Step advances.

- [ ] **Step 3: Commit**

```bash
git add src/components/game/tutorial.ts src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): tutorial waits for dash input to advance"
```

---

## Task 11: End-to-end verification

**Files:** none — verification only

- [ ] **Step 1: Tutorial run (cleared localStorage)**

1. Clear localStorage.
2. Start game. Tutorial banner "ORBITAL DODGE" for 2s.
3. Move prompt. Tap A. Advances.
4. "Fire Auto-Lock" plays. Asteroids start spawning + auto-shooting. Advances after 2.5s.
5. "Dodge" prompt + forced asteroid. Pass it. Advances.
6. "Dash" prompt. Double-tap. Ship dashes. Advances.
7. "Combo" prompt for 3s. Advances.
8. "GOOD LUCK PILOT" for 1.5s. Tutorial ends. Normal gameplay resumes.
9. Die. Achievement "Welcome, Pilot" toast. Reload. `profile.tutorialComplete === true`, tutorial does NOT run.

- [ ] **Step 2: Achievements**

1. Achieve 100 points → "Century" toast.
2. Achieve 1000 points → "Four Digits" toast.
3. Reach 10-kill combo → "Rhythm" toast.
4. Defeat a boss (via Shift+B if Plan 4 shipped) → "Giant Killer" toast.
5. Open shop → Achievements tab. Grid shows unlocked in amber, locked in gray.

- [ ] **Step 3: Dash**

1. Double-tap A during play. Ship dashes left ~3 units with cyan afterimage.
2. Try to re-dash within 2s — cooldown blocks.
3. Dash into asteroid — no damage taken (invulnerable).
4. Mobile: swipe quickly left/right → dash triggers.

- [ ] **Step 4: Cosmetic unlock**

1. Play a run scoring 10,000+. "Five Figures" unlocks + "hull-five-figures" cosmetic granted.
2. Open shop → Cosmetics tab. New hull appears as equippable (if Plan 3 shipped).

- [ ] **Step 5: Commit checkpoint**

```bash
git commit --allow-empty -m "verify(orbital-dodge): tutorial, achievements, and dash QA"
```

---

## Edge cases

1. **Tutorial mid-run conflict** — if tutorial is active and Plan 4 (bosses) schedules a boss at 1500m, the tutorial is long over (~15s). Not an issue in practice since tutorial ends before reaching 1500m.
2. **Dash during boss fight** — invulnerability applies to boss projectiles too. Verify.
3. **Achievement check timing** — evaluated once, on death, after profile counters are incremented. If player unlocks multiple simultaneously, all toast in sequence (staggered 300ms).
4. **Profile schema versioning** — `totalDashes` and `voidTyrantDefeated` are additive fields; use `(p as any).field` reads. Formalize on next v2 bump.
5. **Locked-state cosmetic reveal** — the Cosmetics tab (Plan 3) should only show owned cosmetics; locked ones appear in the Achievements tab as "Unlocked at: X". Consider adding a small "Locked" card in Cosmetics tab that hints at the achievement unlock path, but that's a stretch goal.
6. **Rapid double-clicks** — dash on triple-tap should not chain (2nd dash blocked by cooldown). Verify.

---

## Acceptance recap

When Task 11 passes, this plan is complete. New visitors get a proper onboarding; returning players have achievements to chase + a skill move to master. This plus the other plans close the 6-plan backlog: the game now has a real retention loop, skill expression, variety, polish, and onboarding — the full mobile-runner-grade feature set.
