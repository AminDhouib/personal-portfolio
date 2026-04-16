# Orbital Dodge Anti-Camping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the edge-camping exploit in Orbital Dodge so sitting still while auto-fire clears obstacles is no longer a viable strategy.

**Architecture:** Three coordinated changes to `src/components/game/space-shooter.tsx`: (1) reduce and widen the aim-at-player targeting bias so asteroid spawns don't concentrate on the player's column, (2) give ~25% of regular asteroids lateral velocity so they sweep across the arena, (3) add periodic "wall" spawns — lines of asteroids across the full arena width with a single gap placed ≥3 units from the player's current X so the player is forced to physically move to survive.

**Tech Stack:** TypeScript, React 19, `@react-three/fiber`, Three.js. No test framework in use for this component — verification is manual via Chrome DevTools MCP with a scripted "stationary bot" that confirms time-to-death drops from indefinite to < 45s.

---

## File Structure

- **Modify:** `src/components/game/space-shooter.tsx` — all changes live here. Three coordinated edits:
  - `Obstacle` interface: add `vx: number` and `vy: number` fields (currently only `vz` exists)
  - `GameRefs` interface: add `nextWallAt: number`
  - `createRefs()`: initialize `nextWallAt`
  - `launch()` / Fly Again reset: reset `nextWallAt`
  - `spawnObstacle()` (inside the file): widen targeting band, lower bias to 35%, assign lateral drift to ~25% of basic asteroids
  - Obstacle movement in `runTick()`: apply `vx * step * obstacleSpeedMul` and `vy * step * obstacleSpeedMul` alongside `vz`
  - New helper `spawnWall(g)`: generates a line of asteroids with one gap far from player
  - New helper `pickWallGapX(playerX)`: chooses gap position ≥3 units from player
  - New helper `nextWallTimeMs(now)`: returns next wall trigger time (25-40s out)
  - `runTick()`: add wall-trigger check after the existing obstacle-spawn block

- **No new files needed.** All logic belongs in the shooter component — extracting helpers into a separate module would add import overhead for 30 lines of code; YAGNI.

- **Verification:** Chrome DevTools MCP script run from the running dev server. No file changes — script is pasted via `mcp__chrome-devtools__evaluate_script`.

---

### Task 1: Widen and reduce aim-at-player targeting bias (Fix 4)

**Files:**
- Modify: `src/components/game/space-shooter.tsx` (the `spawnObstacle` function)

**Why:** Currently 60% of asteroids spawn inside a ±1.6 X / ±1.2 Y box around the player. When the player camps at the edge, those asteroids concentrate on the player's auto-fire column and get trivially cleared. Reducing to 35% and widening to ±3 X / ±2 Y means most targeted spawns now miss the auto-fire lane and force lateral dodging.

- [ ] **Step 1: Update the `spawnObstacle` aim-at-player branch**

In `spawnObstacle(g: GameRefs)`, find the block that reads:

```ts
// Anti-cheese: 60% spawn near player; 40% random
const aimAtPlayer = Math.random() < 0.6;
let x: number, y: number;
if (aimAtPlayer) {
  x = THREE.MathUtils.clamp(g.shipX + (Math.random() - 0.5) * 3.2, -ARENA_W / 2, ARENA_W / 2);
  y = THREE.MathUtils.clamp(g.shipY + (Math.random() - 0.5) * 2.4, -ARENA_H / 2, ARENA_H / 2);
} else {
  x = (Math.random() - 0.5) * ARENA_W;
  y = (Math.random() - 0.5) * ARENA_H;
}
```

Replace with:

```ts
// Anti-camp: 35% of asteroids are loosely aimed at the player's wider
// neighborhood (±3 X, ±2 Y), 65% uniform across the arena. The wider band
// means aim-at-player no longer concentrates on the auto-fire lane so
// camping at any single point no longer guarantees clean kills.
const aimAtPlayer = Math.random() < 0.35;
let x: number, y: number;
if (aimAtPlayer) {
  x = THREE.MathUtils.clamp(g.shipX + (Math.random() - 0.5) * 6, -ARENA_W / 2, ARENA_W / 2);
  y = THREE.MathUtils.clamp(g.shipY + (Math.random() - 0.5) * 4, -ARENA_H / 2, ARENA_H / 2);
} else {
  x = (Math.random() - 0.5) * ARENA_W;
  y = (Math.random() - 0.5) * ARENA_H;
}
```

- [ ] **Step 2: Lint check**

Run:

```bash
npx eslint src/components/game/space-shooter.tsx
```

Expected: no output (clean).

- [ ] **Step 3: Reload the game in the browser and eyeball**

With the dev server running, reload `http://localhost:3000/games` (or `/` for the embedded view), start a run, stay at the center, and observe asteroid spawn distribution for 30 seconds. You should see asteroids spawning at visibly wider X positions than before — not clustered tightly around the ship.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "fix(orbital-dodge): widen aim-at-player targeting band (35% at ±3X/±2Y)"
```

---

### Task 2: Add lateral drift to ~25% of asteroids (Fix 2)

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

**Why:** Even with wider targeting, asteroids still travel straight along +Z. Once spawned off the player's column they stay off-column — camping still works if all the player has to do is stay in a lane where nothing ever crosses. Giving a quarter of asteroids a small `vx`/`vy` drift means even a stationary player will have asteroids sweep through their column from other starting positions.

- [ ] **Step 1: Add `vx` and `vy` to the `Obstacle` interface**

Find the existing `Obstacle` interface declaration:

```ts
interface Obstacle {
  id: number;
  variant: ObstacleVariant;
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  rsx: number; rsy: number; rsz: number;
  vz: number; // forward speed
  size: number;
  hp: number;
  shape: 0 | 1 | 2;
}
```

Replace with:

```ts
interface Obstacle {
  id: number;
  variant: ObstacleVariant;
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  rsx: number; rsy: number; rsz: number;
  vx: number; vy: number; vz: number; // full 3D velocity
  size: number;
  hp: number;
  shape: 0 | 1 | 2;
}
```

- [ ] **Step 2: Assign lateral drift in `spawnObstacle`**

In `spawnObstacle`, find the `return { ... }` statement at the bottom. Before the return, add drift computation, and add `vx`/`vy` to the returned object. Find:

```ts
  return {
    id: nextId(g),
    variant,
    x, y,
    z: SPAWN_Z - Math.random() * 8,
    rx: Math.random() * Math.PI,
    ry: Math.random() * Math.PI,
    rz: Math.random() * Math.PI,
    rsx: (Math.random() - 0.5) * 1.8,
    rsy: (Math.random() - 0.5) * 1.8,
    rsz: (Math.random() - 0.5) * 1.8,
    vz: speed,
    size, hp,
    shape: Math.floor(Math.random() * 3) as 0 | 1 | 2,
  };
```

Replace with:

```ts
  // ~25% of basic asteroids get a lateral drift so even a stationary player
  // can't rely on asteroids staying out of their column. Speeders and heavies
  // stay straight-line — they already have their own identity.
  let vx = 0;
  let vy = 0;
  if (variant === "basic" && Math.random() < 0.25) {
    // Drift toward the opposite half of the arena so an asteroid spawned on
    // the left sweeps right and vice versa. 1-2.5 units/sec horizontal,
    // slight vertical component for visual variety.
    vx = -Math.sign(x || 1) * (1 + Math.random() * 1.5);
    vy = (Math.random() - 0.5) * 1.5;
  }

  return {
    id: nextId(g),
    variant,
    x, y,
    z: SPAWN_Z - Math.random() * 8,
    rx: Math.random() * Math.PI,
    ry: Math.random() * Math.PI,
    rz: Math.random() * Math.PI,
    rsx: (Math.random() - 0.5) * 1.8,
    rsy: (Math.random() - 0.5) * 1.8,
    rsz: (Math.random() - 0.5) * 1.8,
    vx, vy, vz: speed,
    size, hp,
    shape: Math.floor(Math.random() * 3) as 0 | 1 | 2,
  };
```

- [ ] **Step 3: Apply `vx`/`vy` in `runTick` obstacle movement**

In `runTick`, find the obstacle-movement loop:

```ts
  // Move + collide obstacles. Warp multiplies forward velocity so they whip
  // past the ship dramatically.
  const obstacleSpeedMul = THREE.MathUtils.lerp(1, 5, wi);
  for (let i = g.obstacles.length - 1; i >= 0; i--) {
    const o = g.obstacles[i];
    o.z += o.vz * step * obstacleSpeedMul;
    o.rx += o.rsx * step;
    o.ry += o.rsy * step;
    o.rz += o.rsz * step;
```

Replace with:

```ts
  // Move + collide obstacles. Warp multiplies forward velocity so they whip
  // past the ship dramatically. Lateral drift also scales with warp so the
  // world feels coherent during warp bursts.
  const obstacleSpeedMul = THREE.MathUtils.lerp(1, 5, wi);
  for (let i = g.obstacles.length - 1; i >= 0; i--) {
    const o = g.obstacles[i];
    o.x += o.vx * step * obstacleSpeedMul;
    o.y += o.vy * step * obstacleSpeedMul;
    o.z += o.vz * step * obstacleSpeedMul;
    o.rx += o.rsx * step;
    o.ry += o.rsy * step;
    o.rz += o.rsz * step;
```

- [ ] **Step 4: Lint check**

Run:

```bash
npx eslint src/components/game/space-shooter.tsx
```

Expected: no output.

- [ ] **Step 5: Type check**

Run:

```bash
npx tsc --noEmit
```

Expected: no output (clean compile). The newly required `vx`/`vy` fields on `Obstacle` are now set in every spawn path — the only spawn site is `spawnObstacle`.

- [ ] **Step 6: Reload and eyeball**

Reload the game. Start a run. Watch asteroid motion — you should see occasional asteroids moving diagonally across the screen, not just straight toward the camera. About 1 in 4 asteroids should visibly drift sideways.

- [ ] **Step 7: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): add lateral drift velocity to 25% of asteroids"
```

---

### Task 3: Add wall spawn data to GameRefs + initialization (Fix 1 setup)

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

**Why:** Walls need a recurring timer that persists in game refs. Set up the data and init/reset logic before we build the spawn function so the commit history stays clean.

- [ ] **Step 1: Add `nextWallAt` to the `GameRefs` interface**

Find the `GameRefs` interface. Locate the line containing `nextBiomeAt: number;` and add a new line directly below it:

```ts
  nextBiomeAt: number; // distance in metres at which to swap biomes
  nextWallAt: number;  // performance.now() timestamp for next wall spawn
```

- [ ] **Step 2: Add helper `nextWallTimeMs`**

Add this helper function near the other spawn helpers (next to `pickNextBiomeDistance`):

```ts
// Walls trigger every 25-40s of real time. Randomized so the player can't
// memorize the cadence.
function nextWallTimeMs(now: number): number {
  return now + 25_000 + Math.random() * 15_000;
}
```

- [ ] **Step 3: Initialize `nextWallAt` in `createRefs`**

Find the `createRefs` function. The first wall should not trigger for at least 20 seconds into a run, so initial value is `performance.now() + 20_000` (the run starts at `performance.now()` when armed → playing transitions — the initial delay gives the player room to warm up before the first wall).

Actually, the cleaner pattern: defer computing "now" until the run actually starts. We already do this for other timestamps via `startRun`. So `createRefs` can set `nextWallAt: 0`, and `startRun` will set the real value.

Find the `createRefs` return block. Locate `nextBiomeAt: pickNextBiomeDistance(0),` and add immediately below it:

```ts
    nextBiomeAt: pickNextBiomeDistance(0),
    nextWallAt: 0, // set by startRun
```

- [ ] **Step 4: Set `nextWallAt` in `startRun`**

Find the `startRun` function:

```ts
function startRun(g: GameRefs): boolean {
  if (g.status !== "armed") return false;
  const now = performance.now();
  g.status = "playing";
  g.startedAt = now;
  g.invulnUntil = now + START_INVULN_MS;
  g.lastSpawn = now;
  g.lastPowerUpSpawn = now;
  g.lastUiSync = 0;
  sounds.startGameplayMusic();
  return true;
}
```

Replace with:

```ts
function startRun(g: GameRefs): boolean {
  if (g.status !== "armed") return false;
  const now = performance.now();
  g.status = "playing";
  g.startedAt = now;
  g.invulnUntil = now + START_INVULN_MS;
  g.lastSpawn = now;
  g.lastPowerUpSpawn = now;
  g.lastUiSync = 0;
  // First wall at least 20s into the run — the player needs warm-up time
  // before facing a forced-positioning challenge.
  g.nextWallAt = now + 20_000;
  sounds.startGameplayMusic();
  return true;
}
```

- [ ] **Step 5: Reset `nextWallAt` in `launch` (Fly Again)**

Find the `launch` function — it already resets other timestamps. Locate the block that resets timestamps (it has `g.lastSpawn = 0;` `g.lastPowerUpSpawn = 0;` etc.) and add:

```ts
    g.lastPowerUpSpawn = 0;
    g.nextWallAt = 0;
```

Place the new line immediately after `g.lastPowerUpSpawn = 0;` — this line already exists in the reset block.

- [ ] **Step 6: Type check**

Run:

```bash
npx tsc --noEmit
```

Expected: no output. The new required field `nextWallAt` is now populated in `createRefs` and reset in `launch`.

- [ ] **Step 7: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "chore(orbital-dodge): add nextWallAt ref + timer helper (no behaviour yet)"
```

---

### Task 4: Implement wall spawn function (Fix 1 core)

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

**Why:** This is the main anti-camp fix. A line of asteroids across the arena with one gap — the gap is chosen far from the player's current position so they're forced to move.

- [ ] **Step 1: Add helper `pickWallGapX`**

Add this helper near `spawnObstacle`:

```ts
// Pick a gap X position for a wall. The gap is placed at least MIN_GAP_DIST
// units from the player's current X so the player has to physically cross
// the arena to reach it — breaking the edge-camping strategy.
function pickWallGapX(playerX: number, arenaW: number): number {
  const MIN_GAP_DIST = 3;
  const half = arenaW / 2;
  // Try candidates; pick the one farthest from the player, subject to the
  // minimum-distance rule.
  let best = -playerX; // mirror is always guaranteed far
  let bestDist = Math.abs(best - playerX);
  for (let i = 0; i < 5; i++) {
    const candidate = (Math.random() - 0.5) * (arenaW - 2);
    const dist = Math.abs(candidate - playerX);
    if (dist >= MIN_GAP_DIST && dist > bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  // Safety: if every candidate failed, step MIN_GAP_DIST away from the player
  // toward the nearest edge.
  if (bestDist < MIN_GAP_DIST) {
    best = playerX > 0 ? playerX - MIN_GAP_DIST : playerX + MIN_GAP_DIST;
  }
  // Clamp inside arena so the gap isn't cut off by the edge.
  return THREE.MathUtils.clamp(best, -half + 1, half - 1);
}
```

- [ ] **Step 2: Add `spawnWall` function**

Add below `pickWallGapX`:

```ts
// Spawn a wall: a line of asteroids across the full arena width at the same
// Z with a single gap. Forces the player to move into the gap — breaks the
// "camp at the edge and let auto-fire clear everything" exploit.
function spawnWall(g: GameRefs) {
  const GAP_WIDTH = 2.5;          // world units — about one ship-radius each side of center
  const WALL_COUNT = 6;           // 6 asteroid slots evenly spaced across ARENA_W
  const gapX = pickWallGapX(g.shipX, ARENA_W);
  const slotWidth = ARENA_W / WALL_COUNT;
  const baseSpeed = 10 + difficulty(g) * 3;
  for (let i = 0; i < WALL_COUNT; i++) {
    const x = -ARENA_W / 2 + (i + 0.5) * slotWidth;
    // Skip slots that fall inside the gap zone
    if (Math.abs(x - gapX) < GAP_WIDTH / 2 + 0.4) continue;
    g.obstacles.push({
      id: nextId(g),
      variant: "basic",
      x,
      y: (Math.random() - 0.5) * 1.5, // slight vertical variation per wall piece
      z: SPAWN_Z,
      rx: Math.random() * Math.PI,
      ry: Math.random() * Math.PI,
      rz: Math.random() * Math.PI,
      rsx: (Math.random() - 0.5) * 1.8,
      rsy: (Math.random() - 0.5) * 1.8,
      rsz: (Math.random() - 0.5) * 1.8,
      vx: 0, vy: 0, // walls stay in-line; no drift, they must remain a wall
      vz: baseSpeed,
      size: 0.8,
      hp: 2, // walls are beefier so auto-fire can't clear one piece before it arrives
      shape: Math.floor(Math.random() * 3) as 0 | 1 | 2,
    });
  }
}
```

- [ ] **Step 3: Trigger wall in `runTick`**

In `runTick`, find the existing obstacle spawn block (the `if (now - g.lastSpawn > spawnIntervalMs(g)...` block). Immediately after that block (after its closing `}`), add:

```ts
  // Wall spawn — every 25-40s, a line of asteroids forces the player to move
  // to a specific gap position. Only while playing (not during warp) so the
  // wall has time to arrive under normal physics before warp trivializes it.
  if (
    g.status === "playing" &&
    wi < 0.1 &&
    g.nextWallAt > 0 &&
    now >= g.nextWallAt
  ) {
    spawnWall(g);
    g.nextWallAt = nextWallTimeMs(now);
  }
```

- [ ] **Step 4: Lint + type check**

Run:

```bash
npx eslint src/components/game/space-shooter.tsx && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Reload and play a run to the first wall**

Reload the game, start a run, and observe:
- At ~20-35 seconds into the run, a line of asteroids spanning the width of the arena should appear at the far Z (spawn distance).
- The gap should clearly be far from the ship's X position at the moment of spawn.
- The wall should reach the ship ~4 seconds after spawning, giving the player time to see and move.
- If the player stays still, they should die on the wall.

- [ ] **Step 6: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): spawn asteroid walls with gap-far-from-player every 25-40s"
```

---

### Task 5: Verification — stationary bot can no longer survive indefinitely

**Files:**
- No file changes. This task runs a Chrome DevTools script against the live dev server to measure time-to-death for a non-moving ship.

**Why:** This is the acceptance test for the whole plan. If a stationary ship can still survive for > 60 seconds, the anti-camp fix has failed. The target: a stationary ship at the edge should die in under 45 seconds in most runs (some runs may die faster if a wall spawns earlier, some may go longer if the first wall happens at ~40s and the ship happens to be near the gap by chance — this is acceptable variance).

- [ ] **Step 1: Ensure the dev server is running**

From the project root:

```bash
npm run dev
```

Wait for "Ready in …" in the output.

- [ ] **Step 2: Open /games in Chrome DevTools MCP**

Use `mcp__chrome-devtools__new_page` or `navigate_page` with URL `http://localhost:3000/games`. Wait for the "Move your mouse or press WASD to start" pill to appear.

- [ ] **Step 3: Run the stationary-bot verification script**

Evaluate this in the page:

```js
async () => {
  // Clear any prior local state so each run starts with no head-start upgrades
  // once the shop system exists. Safe no-op today.
  window.localStorage.removeItem("space-shooter-hs");
  const canvas = document.querySelector('canvas');
  const rect = canvas.getBoundingClientRect();

  // Park the "mouse" at the top-left edge of the canvas — the worst-case
  // camping spot (corner). The first pointermove starts the run.
  const edgeX = rect.left + 10;
  const edgeY = rect.top + 10;
  canvas.dispatchEvent(new PointerEvent('pointermove', {
    clientX: edgeX, clientY: edgeY, bubbles: true,
  }));

  // Poll every 250ms until the death overlay appears. Cap at 120s so we
  // don't hang the test forever.
  const start = performance.now();
  let survivedMs = 0;
  while (performance.now() - start < 120_000) {
    await new Promise((r) => setTimeout(r, 250));
    if (document.body.innerText.includes('SHIP DESTROYED')) {
      survivedMs = performance.now() - start;
      break;
    }
  }
  // Pull score from the HUD / death overlay for context
  const scoreEl = document.querySelector('[class*="tabular-nums"]');
  return {
    survivedSeconds: +(survivedMs / 1000).toFixed(1),
    reached120sCap: survivedMs === 0,
    bodyText: document.body.innerText.slice(0, 500),
  };
}
```

- [ ] **Step 4: Interpret the result**

Expected: `survivedSeconds` is between 20 and 45 seconds, `reached120sCap` is `false`.

- Below 20s: walls are spawning too early or too aggressively — raise `startRun`'s initial delay (currently 20_000 ms) or raise the next-wall interval.
- Between 20 and 45s: PASS. Anti-camp fix is working; the first wall forces the stationary ship to die.
- Above 45s but below 120s: marginal — may just be a lucky run where the first wall gap was close to the spawn point. Run 2 more times; expect majority to land in the 20-45s band.
- 120s cap reached (`reached120sCap: true`): FAIL. Wall spawn isn't firing, or the gap is too generous. Check the browser console for errors, then trace `g.nextWallAt` and `g.obstacles` via an ad-hoc eval inspection.

- [ ] **Step 5: Run the script three times total for confidence**

Reload the page between runs (to reset game state). Record all three `survivedSeconds` values. Expect at least 2 of 3 to land in the 20-45s band.

- [ ] **Step 6: Sanity-check normal gameplay is still fun**

Play one real run (actively dodging, not camping) for ≥60s. The walls should feel like a climactic moment that requires attention, not a sudden rug-pull. If they feel cheap, widen the gap (`GAP_WIDTH` from 2.5 → 3.0) and/or slow the wall speed (`baseSpeed` from `10 + difficulty * 3` → `9 + difficulty * 2.5`).

- [ ] **Step 7: No commit needed — verification only**

This task has no file changes. If tuning was required in Step 6, that's a separate follow-up commit.

---

### Task 6: (Optional) Tuning pass based on verification

**Files:**
- Modify: `src/components/game/space-shooter.tsx` (only if verification revealed a problem)

**Why:** The numbers above (35% aim bias, 25% drift, 25-40s wall cadence, 2.5u gap width, 2 HP walls, 20s first-wall delay) are best-guess tunings. If verification showed the anti-camp fix kills the player too fast or lets them survive too long, tune and re-verify.

- [ ] **Step 1: If walls feel too brutal**

Increase `GAP_WIDTH` from 2.5 to 3.0 in `spawnWall`, and/or reduce `WALL_COUNT` from 6 to 5. Re-run verification.

- [ ] **Step 2: If walls feel too easy (time-to-death > 60s consistently)**

Decrease first-wall delay in `startRun` from 20_000 to 15_000, and/or decrease `nextWallTimeMs` interval from `25_000 + Math.random() * 15_000` to `18_000 + Math.random() * 12_000`.

- [ ] **Step 3: If lateral drift feels chaotic**

Reduce drift magnitude in `spawnObstacle` — change `1 + Math.random() * 1.5` to `0.6 + Math.random() * 1`. Or reduce the 25% drift rate to 15-20%.

- [ ] **Step 4: Commit tuning**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "tune(orbital-dodge): anti-camp numbers from playtest feedback"
```

---

## Acceptance Criteria

- Stationary ship at canvas corner dies in under 45 seconds in at least 2 of 3 verification runs.
- Active play (moving normally to dodge) still feels fair — walls arrive as telegraphed challenges, not as surprises. A skilled player should survive 2+ walls.
- Lateral drift is visible on ~1 in 4 asteroids — you can see asteroids moving diagonally, not just straight.
- No console errors during a full run through two wall cycles.
- Lint and TypeScript are clean after all changes.
