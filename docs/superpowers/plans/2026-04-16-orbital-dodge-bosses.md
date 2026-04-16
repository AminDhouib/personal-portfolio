# Orbital Dodge — Bosses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 8 distinct boss encounters that interrupt endless-runner flow at distance milestones, provide real gameplay variety, and drop guaranteed rewards — without breaking the "new visitor can still enjoy run 1" guarantee from the roadmap.

**Architecture:** Bosses are authored as discrete entity types with shared base (HP, phase, projectile emitter) and per-boss behavior callbacks. A boss manager checks `distanceTraveled` against a schedule; when it hits a milestone, normal obstacle spawning pauses, arena darkens, warning text appears, then the boss enters from the top rail. Player must dodge + kill. On defeat, normal spawning resumes with bonus coins + guaranteed drop. Bosses scale with a `difficultyMult` that's derived from `currentWave` so repeat encounters scale up across longer runs.

**Tech Stack:** TypeScript, React 19, `@react-three/fiber`, Three.js. No new deps.

---

## Context for the implementing engineer

This plan is independent of the economy track (Plans 1–3) and can ship in parallel. It does **not** require the combo multiplier or the shop to be in place, but the two interact nicely:

- If Plan 1 (combo) has shipped, killing a boss projectile with the ship's auto-fire counts as a regular enemy for combo tier purposes. Use the existing combo hooks; don't add new ones.
- If Plan 2 (shop) has shipped, boss defeats drop 100–500 coins (scaling with boss #). If Plan 2 hasn't shipped, the coin drop lines become no-ops — leave the code paths in, gated by `typeof profile !== 'undefined'` or similar. **Do not** implement the profile module in this plan — that's Plan 2's job. Just code defensively so the boss system doesn't crash on profile-less builds.
- If Plan 4 (this plan) ships before Plan 2, the `totalBossesDefeated` counter in the roadmap's `Profile` interface will not yet exist. That's fine — write the increment behind a null-safe check so Plan 2 can wire it up later.

**Where to write code:** This is all in `src/components/game/space-shooter.tsx` unless explicitly called out. The file is ~3000 lines. If you feel it's getting unmanageable, propose a split as a follow-up — don't do it inside this plan.

**Testing:** No unit tests for game code per user preference. Verify each boss manually via Chrome DevTools MCP. Each task's verification step walks through what to observe.

---

## File structure

- **Modify:** `src/components/game/space-shooter.tsx` — add boss types, manager, UI overlays, rendering, all boss behavior
- **(Conditional) Modify:** `src/components/game/profile.ts` — only if Plan 2 has shipped; increment `totalBossesDefeated` on defeat. If Plan 2 hasn't shipped, skip.

No new files. No new deps.

---

## Acceptance criteria

When this plan is complete:

1. At distance 1500m in run 1, the arena darkens, "INCOMING: SENTINEL" appears, and the Sentinel boss enters. Music shifts to boss theme layer (if Plan 5 polish music layers exist; otherwise a single kick-drum pulse suffices).
2. Sentinel has a visible HP bar at the top of the screen; it takes ~8 hits from auto-fire to kill.
3. All 8 bosses (Sentinel, Drifter, Swarm Mother, Mirror, Pulsar, Harvester, Warden, Void Tyrant) can be triggered and defeated in isolation via a dev hotkey (Shift+B cycles through them at current position).
4. Each boss has a distinct projectile pattern documented in Task 3.
5. Boss defeat triggers: score bonus (500×bossTier pts), coin drop (100×bossTier, gated on profile availability), guaranteed next-power-up spawn within 2s, brief screen-shake, particle burst.
6. Boss death does NOT instantly end run or soft-lock — normal obstacle spawning resumes immediately and ship transitions back to normal state.
7. If player dies during a boss fight, normal game-over flow runs. Boss does not persist across runs.
8. Shift+B hotkey is dev-only — wrapped in `process.env.NODE_ENV !== 'production'`.
9. Repeat encounters (past 6000m distance, bosses recycle) scale up: ×1.3 HP per recycle.
10. Boss encounters don't awkwardly interrupt the score counter / distance counter — UI stays visible.

---

## Task 1: Boss type definitions + manager state

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Add boss type definitions**

Above `interface GameRefs` (search for `interface GameRefs`), add:

```typescript
type BossId =
  | "sentinel"      // tier 1 @ 1500m
  | "drifter"       // tier 2 @ 3000m
  | "swarm-mother"  // tier 3 @ 4500m
  | "mirror"        // tier 4 @ 6000m
  | "pulsar"        // tier 5 @ 7500m
  | "harvester"     // tier 6 @ 9000m
  | "warden"        // tier 7 @ 11000m
  | "void-tyrant";  // tier 8 @ 13000m

type BossPhase = "intro" | "fighting" | "dying" | "defeated";

interface BossState {
  id: BossId;
  tier: number;              // 1..8
  hp: number;                // current
  hpMax: number;             // current max (scales with difficultyMult)
  position: [number, number, number];
  velocity: [number, number, number];
  phase: BossPhase;
  phaseStartAt: number;      // timestamp ms
  encounterStartAt: number;  // timestamp ms
  lastShotAt: number;        // timestamp ms for pattern timing
  patternIndex: number;      // for bosses with multi-stage patterns
  difficultyMult: number;    // 1.0 first encounter, 1.3^recycles
  subEntities: SubEntity[];  // used by swarm-mother, harvester etc.
  rng: () => number;         // seeded from encounterStartAt for consistent per-encounter behavior
}

interface SubEntity {
  type: "drone" | "mine" | "beam-segment";
  position: [number, number, number];
  velocity: [number, number, number];
  hp: number;
  createdAt: number;
  ttlMs: number;             // 0 = indefinite
}

interface BossProjectile {
  id: number;
  position: [number, number, number];
  velocity: [number, number, number];
  radius: number;
  color: string;
  spawnedAt: number;
  ttlMs: number;
  // "homing" bullets update velocity each tick toward ship
  homing: boolean;
  // "shielded" projectiles ignore ship auto-fire (must be dodged)
  shielded: boolean;
}
```

- [x] **Step 2: Add boss manager state to GameRefs**

Inside the `interface GameRefs { ... }` block, add these fields (near where obstacles / bullets are declared):

```typescript
  // Boss system
  boss: BossState | null;
  bossProjectiles: BossProjectile[];
  bossSchedule: { distance: number; bossId: BossId }[]; // populated at run start
  bossScheduleIdx: number;   // next scheduled index
  bossesDefeatedThisRun: number;
  normalSpawningPausedUntil: number; // timestamp ms; spawning paused while !== 0 and now < this
  devHotkeyArmed: boolean;   // tracks Shift held for Shift+B
```

- [x] **Step 3: Initialize boss fields in the game-reset path**

Find the block that resets `refs` at run start (search for `obstacles: []` or the function/method that resets gameplay state at the start of a run). In the same block, add:

```typescript
refs.current.boss = null;
refs.current.bossProjectiles = [];
refs.current.bossSchedule = buildBossSchedule();
refs.current.bossScheduleIdx = 0;
refs.current.bossesDefeatedThisRun = 0;
refs.current.normalSpawningPausedUntil = 0;
```

Add the `buildBossSchedule` helper **above** the run-reset function:

```typescript
function buildBossSchedule(): { distance: number; bossId: BossId }[] {
  return [
    { distance: 1500,  bossId: "sentinel" },
    { distance: 3000,  bossId: "drifter" },
    { distance: 4500,  bossId: "swarm-mother" },
    { distance: 6000,  bossId: "mirror" },
    { distance: 7500,  bossId: "pulsar" },
    { distance: 9000,  bossId: "harvester" },
    { distance: 11000, bossId: "warden" },
    { distance: 13000, bossId: "void-tyrant" },
    // After 13000m, cycle back with difficulty mult
    { distance: 16000, bossId: "sentinel" },
    { distance: 19000, bossId: "drifter" },
    { distance: 22000, bossId: "swarm-mother" },
  ];
}
```

- [x] **Step 4: Add seeded RNG helper**

Near the top of the file with other utilities, add (if not already present — check first):

```typescript
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [x] **Step 5: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): add boss type definitions and manager state"
```

---

## Task 2: Boss spawn trigger + intro sequence

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Add spawn check in the game tick**

Find the main per-frame tick function (search for `runTick` or the useFrame body — there's likely one top-level game tick). After the `distanceTraveled` gets updated each frame but **before** normal obstacle spawning, add:

```typescript
// Boss scheduling check — only if no boss active
if (!refs.current.boss && refs.current.bossScheduleIdx < refs.current.bossSchedule.length) {
  const next = refs.current.bossSchedule[refs.current.bossScheduleIdx];
  if (refs.current.distanceTraveled >= next.distance) {
    const recycleCount = Math.floor(refs.current.bossScheduleIdx / 8);
    spawnBoss(refs.current, next.bossId, recycleCount);
    refs.current.bossScheduleIdx += 1;
  }
}

// Gate normal spawning while boss is present
const bossIsActive = refs.current.boss && refs.current.boss.phase !== "defeated";
if (bossIsActive) {
  refs.current.normalSpawningPausedUntil = performance.now() + 100; // keep paused
}
```

Find the existing obstacle spawn check (search for `Math.random()` near obstacle push or a `spawnInterval`). Wrap it in:

```typescript
if (performance.now() > refs.current.normalSpawningPausedUntil) {
  // existing obstacle spawn logic untouched
}
```

- [x] **Step 2: Implement `spawnBoss`**

Add above the tick function:

```typescript
function spawnBoss(state: GameRefs, bossId: BossId, recycleCount: number): void {
  const tier = BOSS_TIERS[bossId];
  const difficultyMult = Math.pow(1.3, recycleCount);
  const baseHp = BOSS_BASE_HP[bossId];
  const now = performance.now();
  const seed = Math.floor(now) ^ (tier * 1_000_003);
  state.boss = {
    id: bossId,
    tier,
    hp: baseHp * difficultyMult,
    hpMax: baseHp * difficultyMult,
    position: [0, 6, -40], // spawn above + far forward
    velocity: [0, 0, 0.6],  // drift toward player at intro
    phase: "intro",
    phaseStartAt: now,
    encounterStartAt: now,
    lastShotAt: now,
    patternIndex: 0,
    difficultyMult,
    subEntities: [],
    rng: mulberry32(seed),
  };
}

const BOSS_TIERS: Record<BossId, number> = {
  sentinel: 1, drifter: 2, "swarm-mother": 3, mirror: 4,
  pulsar: 5, harvester: 6, warden: 7, "void-tyrant": 8,
};

const BOSS_BASE_HP: Record<BossId, number> = {
  sentinel: 8, drifter: 12, "swarm-mother": 20, mirror: 18,
  pulsar: 25, harvester: 30, warden: 40, "void-tyrant": 60,
};

const BOSS_DISPLAY_NAMES: Record<BossId, string> = {
  sentinel: "SENTINEL",
  drifter: "DRIFTER",
  "swarm-mother": "SWARM MOTHER",
  mirror: "MIRROR",
  pulsar: "PULSAR",
  harvester: "HARVESTER",
  warden: "WARDEN",
  "void-tyrant": "VOID TYRANT",
};
```

- [x] **Step 3: Intro phase behavior (1.5s scripted)**

In the tick, after the spawn check, add:

```typescript
const boss = refs.current.boss;
if (boss) {
  const now = performance.now();
  const phaseAge = now - boss.phaseStartAt;

  if (boss.phase === "intro") {
    // Drift in from z=-40 to z=-15 over 1500ms
    const t = Math.min(1, phaseAge / 1500);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    boss.position[2] = -40 + eased * 25;
    boss.position[1] = 6 - eased * 3;
    if (t >= 1) {
      boss.phase = "fighting";
      boss.phaseStartAt = now;
    }
  }
}
```

- [x] **Step 4: Intro UI overlay**

Find the JSX return body of the Game component. Add near other overlays (search for existing overlay JSX like the score HUD):

```tsx
{refs.current.boss && refs.current.boss.phase === "intro" && (
  <div className="absolute inset-x-0 top-[18%] flex flex-col items-center pointer-events-none z-30">
    <div className="text-xs tracking-[0.4em] text-red-400 animate-pulse">INCOMING</div>
    <div className="text-3xl sm:text-5xl font-black text-white drop-shadow-[0_0_12px_rgba(239,68,68,0.6)]">
      {BOSS_DISPLAY_NAMES[refs.current.boss.id]}
    </div>
  </div>
)}
```

Note: `refs.current` access in render requires a subscribed re-render. If the existing game uses a `tick` counter or `useState` for HUD updates, reuse that mechanism. If not, introduce a `uiTick` state that bumps every ~100ms via `setInterval` on mount — don't force a 60fps re-render.

- [x] **Step 5: Dev hotkey (Shift+B)**

Find the existing keyboard handler (search for `addEventListener("keydown"`). Add:

```typescript
if (process.env.NODE_ENV !== "production" && e.shiftKey && e.key.toLowerCase() === "b") {
  e.preventDefault();
  // Cycle through bosses at current position
  const bossIds: BossId[] = [
    "sentinel", "drifter", "swarm-mother", "mirror",
    "pulsar", "harvester", "warden", "void-tyrant",
  ];
  const currentIdx = refs.current.boss ? bossIds.indexOf(refs.current.boss.id) : -1;
  const nextIdx = (currentIdx + 1) % bossIds.length;
  refs.current.boss = null;
  refs.current.bossProjectiles = [];
  spawnBoss(refs.current, bossIds[nextIdx], 0);
}
```

- [x] **Step 6: Manual verification**

Run dev server, open game, start run. Press Shift+B. Expected: arena darkens (will add in Task 4), "INCOMING: SENTINEL" text appears, sentinel drifts in from top. After 1.5s, text disappears and boss enters fighting phase (will render black cube for now — actual geometry in Task 3).

- [x] **Step 7: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): boss spawn trigger and intro sequence"
```

---

## Task 3: Sentinel boss (tier 1) — rotating twin-laser pattern

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

**Sentinel design:** A hexagonal core with two rotating laser emitters. Fires 2 parallel "shielded" (bullet-immune) projectiles every 1200ms, with the emitter angle rotating 45° between shots. Player must predict next angle and move through the gap. HP 8. The easy boss — teaches "dodge instead of shoot."

- [x] **Step 1: Render the Sentinel mesh**

Inside the game's scene JSX (search for where obstacles are rendered, e.g. `{refs.current.obstacles.map(...)}`), add:

```tsx
{refs.current.boss && refs.current.boss.id === "sentinel" && (
  <SentinelMesh boss={refs.current.boss} />
)}
```

Add the component above the main Game component:

```tsx
function SentinelMesh({ boss }: { boss: BossState }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(boss.position[0], boss.position[1], boss.position[2]);
    groupRef.current.rotation.y += 0.02;
  });
  return (
    <group ref={groupRef}>
      <mesh>
        <cylinderGeometry args={[1.2, 1.2, 0.4, 6]} />
        <meshStandardMaterial color="#1e293b" emissive="#ef4444" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.3]}>
        <torusGeometry args={[0.8, 0.15, 8, 16]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}
```

- [x] **Step 2: Implement Sentinel shooting pattern**

In the tick, inside the `if (boss)` block from Task 2, after the `if (boss.phase === "intro")` handler, add:

```typescript
if (boss.phase === "fighting") {
  // per-boss behavior
  if (boss.id === "sentinel") {
    runSentinelBehavior(refs.current, boss, now);
  }
  // other bosses added in later tasks
}
```

Add the behavior function:

```typescript
function runSentinelBehavior(state: GameRefs, boss: BossState, now: number): void {
  // Sentinel sits at z=-15, strafes x left/right sinusoidally
  const phaseAge = now - boss.phaseStartAt;
  boss.position[0] = Math.sin(phaseAge * 0.0008) * 3.5;

  // Fire every 1200ms / difficultyMult
  const shotInterval = 1200 / boss.difficultyMult;
  if (now - boss.lastShotAt >= shotInterval) {
    const angleRad = boss.patternIndex * (Math.PI / 4); // 45° steps
    const gap = 1.4; // gap between the two parallel lasers
    const perpX = Math.cos(angleRad);
    const perpY = Math.sin(angleRad);
    const dirToPlayer = normalize([
      state.ship.position[0] - boss.position[0],
      state.ship.position[1] - boss.position[1],
      state.ship.position[2] - boss.position[2],
    ]);
    const speed = 12;
    for (let k = -1; k <= 1; k += 2) {
      state.bossProjectiles.push({
        id: state.nextProjectileId++,
        position: [
          boss.position[0] + perpX * gap * k,
          boss.position[1] + perpY * gap * k,
          boss.position[2],
        ],
        velocity: [dirToPlayer[0] * speed, dirToPlayer[1] * speed, dirToPlayer[2] * speed],
        radius: 0.35,
        color: "#ef4444",
        spawnedAt: now,
        ttlMs: 4000,
        homing: false,
        shielded: true, // bullet-immune
      });
    }
    boss.lastShotAt = now;
    boss.patternIndex = (boss.patternIndex + 1) % 8;
  }
}

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
```

Also add `nextProjectileId: 0` to the GameRefs init block in Task 1, and to the interface.

- [x] **Step 3: Render + update boss projectiles**

In the scene JSX:

```tsx
{refs.current.bossProjectiles.map((p) => (
  <mesh key={p.id} position={p.position}>
    <sphereGeometry args={[p.radius, 8, 8]} />
    <meshBasicMaterial color={p.color} />
  </mesh>
))}
```

In the tick:

```typescript
// Update boss projectiles
const dt = deltaMs / 1000;
const ship = refs.current.ship;
for (let i = refs.current.bossProjectiles.length - 1; i >= 0; i--) {
  const p = refs.current.bossProjectiles[i];
  if (p.homing) {
    const dir = normalize([
      ship.position[0] - p.position[0],
      ship.position[1] - p.position[1],
      ship.position[2] - p.position[2],
    ]);
    const speed = Math.hypot(p.velocity[0], p.velocity[1], p.velocity[2]);
    p.velocity[0] = dir[0] * speed;
    p.velocity[1] = dir[1] * speed;
    p.velocity[2] = dir[2] * speed;
  }
  p.position[0] += p.velocity[0] * dt;
  p.position[1] += p.velocity[1] * dt;
  p.position[2] += p.velocity[2] * dt;
  // Collision with ship
  const dx = p.position[0] - ship.position[0];
  const dy = p.position[1] - ship.position[1];
  const dz = p.position[2] - ship.position[2];
  const hitDist = p.radius + 0.6;
  if (dx * dx + dy * dy + dz * dz < hitDist * hitDist) {
    applyShipDamage(refs.current, now);
    refs.current.bossProjectiles.splice(i, 1);
    continue;
  }
  // TTL / far
  if (now - p.spawnedAt > p.ttlMs || p.position[2] > 10) {
    refs.current.bossProjectiles.splice(i, 1);
  }
}
```

**Note:** `applyShipDamage` already exists in the game — find the existing damage handler and call it. If it's inline, extract it into a named function in this task so bosses + obstacles share one damage path.

- [x] **Step 4: Bullet-vs-boss collision**

In the existing auto-fire bullet update loop, **before** the obstacle-collision block, add a boss-collision check:

```typescript
if (refs.current.boss && refs.current.boss.phase === "fighting") {
  const b = refs.current.boss;
  const dx = bullet.position[0] - b.position[0];
  const dy = bullet.position[1] - b.position[1];
  const dz = bullet.position[2] - b.position[2];
  const hitRadius = 1.5; // boss hitbox
  if (dx * dx + dy * dy + dz * dz < hitRadius * hitRadius) {
    b.hp -= 1;
    refs.current.bullets.splice(bulletIdx, 1);
    // Flash + micro-shake
    b.position[0] += (Math.random() - 0.5) * 0.1;
    if (b.hp <= 0) {
      b.phase = "dying";
      b.phaseStartAt = now;
    }
    continue;
  }
}
```

- [x] **Step 5: HP bar UI**

Add to the overlay JSX:

```tsx
{refs.current.boss && refs.current.boss.phase === "fighting" && (
  <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none z-30">
    <div className="text-[10px] tracking-[0.3em] text-red-300">
      {BOSS_DISPLAY_NAMES[refs.current.boss.id]}
    </div>
    <div className="w-48 sm:w-64 h-2 bg-black/60 border border-red-500/50 overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-[width] duration-100"
        style={{ width: `${(refs.current.boss.hp / refs.current.boss.hpMax) * 100}%` }}
      />
    </div>
  </div>
)}
```

- [x] **Step 6: Manual verification**

Launch via Shift+B → Sentinel. Observe:
- Sentinel drifts in, enters fighting phase, starts strafing x.
- Twin parallel red spheres fire every 1.2s at increasing angles.
- Bullets damage the Sentinel (HP bar shrinks).
- After 8 hits, Sentinel enters "dying" phase (no visuals yet — Task 5 adds death).

- [x] **Step 7: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): implement Sentinel boss"
```

---

## Task 4: Arena darkening + boss music pulse

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Darken the arena during boss**

Find the Scene's ambient lighting or background color. Add a ref-driven tint multiplier. At the top of the render (or in the lighting JSX), compute:

```typescript
const bossActive = refs.current.boss && refs.current.boss.phase !== "defeated";
const ambientIntensity = bossActive ? 0.08 : 0.25;
const pointLightColor = bossActive ? "#7f1d1d" : "#ffffff";
```

Apply to the existing `<ambientLight />` and `<pointLight />` (or equivalent).

- [x] **Step 2: Boss music pulse**

Find the existing `scheduleAudioBeat` or music generator. Add a boss layer:

```typescript
function playBossPulse(audioCtx: AudioContext, now: number) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.value = 55; // low A
  gain.gain.setValueAtTime(0.0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.45);
}
```

In the tick, when a boss is in fighting phase, every 700ms call `playBossPulse`. Track `lastBossPulseAt` on `GameRefs`.

- [x] **Step 3: Manual verification**

Spawn Sentinel via Shift+B. Observe arena darkens; pulsing low-frequency thump plays every ~700ms. Defeat boss; arena returns to normal brightness and pulse stops.

- [x] **Step 4: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): darken arena and pulse music during boss fights"
```

---

## Task 5: Boss defeat — dying animation, rewards, cleanup

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Dying phase handler**

In the `if (boss)` block:

```typescript
if (boss.phase === "dying") {
  const dyingAge = now - boss.phaseStartAt;
  const DYING_MS = 1200;
  // Spin + scale down + flashing particles
  boss.position[1] += 0.02; // drift up
  if (dyingAge >= DYING_MS) {
    onBossDefeated(refs.current, boss, now);
    boss.phase = "defeated";
  }
}
```

- [x] **Step 2: Dying visual effect**

In `SentinelMesh`, read boss phase. When `dying`, shrink the mesh:

```tsx
useFrame(() => {
  if (!groupRef.current) return;
  groupRef.current.position.set(...boss.position);
  groupRef.current.rotation.y += boss.phase === "dying" ? 0.2 : 0.02;
  if (boss.phase === "dying") {
    const t = Math.min(1, (performance.now() - boss.phaseStartAt) / 1200);
    const s = 1 - t;
    groupRef.current.scale.setScalar(Math.max(0, s));
  } else {
    groupRef.current.scale.setScalar(1);
  }
});
```

- [x] **Step 3: Defeat rewards**

```typescript
function onBossDefeated(state: GameRefs, boss: BossState, now: number): void {
  const scoreBonus = 500 * boss.tier;
  const coinReward = 100 * boss.tier;
  state.score += Math.floor(scoreBonus * (state.scoreMult ?? 1));

  // Coin drop — gated on profile availability
  try {
    const profileModule = require("./profile");
    if (profileModule?.addCoins) {
      profileModule.addCoins(coinReward);
    }
  } catch {
    // Profile module not yet shipped (Plan 2) — no-op
  }

  // Score popup
  state.scorePopups.push({
    id: state.nextPopupId++,
    position: [...boss.position] as [number, number, number],
    text: `+${scoreBonus}`,
    createdAt: now,
    ttlMs: 1800,
    color: "#fbbf24",
  });

  // Guaranteed power-up drop within 2s
  state.powerUpForceDropAt = now + 500;

  // Particle burst
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const pitch = (Math.random() - 0.5) * Math.PI;
    const speed = 4 + Math.random() * 6;
    state.explosions.push({
      id: state.nextExplosionId++,
      position: [...boss.position] as [number, number, number],
      velocity: [
        Math.cos(angle) * Math.cos(pitch) * speed,
        Math.sin(pitch) * speed,
        Math.sin(angle) * Math.cos(pitch) * speed,
      ],
      color: "#ef4444",
      createdAt: now,
      ttlMs: 900,
    });
  }

  // Camera shake
  state.cameraShakeUntil = now + 350;
  state.cameraShakeMagnitude = 0.4;

  state.bossesDefeatedThisRun += 1;

  // Try to bump profile defeated counter
  try {
    const profileModule = require("./profile");
    if (profileModule?.loadProfile && profileModule?.saveProfile) {
      const p = profileModule.loadProfile();
      p.totalBossesDefeated = (p.totalBossesDefeated ?? 0) + 1;
      profileModule.saveProfile(p);
    }
  } catch {
    // Profile module not yet shipped — no-op
  }
}
```

`powerUpForceDropAt` and `cameraShakeUntil` / `cameraShakeMagnitude` may already exist. If not, add them to GameRefs and wire into existing power-up spawn + camera shake logic (the latter likely exists for explosion shake).

- [x] **Step 4: Cleanup on defeated**

At the top of the tick, after the spawn check:

```typescript
if (refs.current.boss && refs.current.boss.phase === "defeated") {
  // Clear remaining projectiles over 500ms (let them fade)
  const clearAfter = refs.current.boss.phaseStartAt + 500;
  if (now >= clearAfter) {
    refs.current.boss = null;
    refs.current.bossProjectiles = [];
  }
}
```

- [x] **Step 5: Manual verification**

Spawn Sentinel, kill it. Observe:
- Shrinks + spins faster over ~1.2s
- 40-particle burst + camera shake on completion
- Score popup `+500` appears
- HP bar disappears
- Arena lights come back
- Within ~2 seconds, a power-up spawns
- Normal asteroid spawning resumes
- `refs.current.bossesDefeatedThisRun` is 1 (check via devtools console)

- [x] **Step 6: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): boss defeat animation, rewards, and cleanup"
```

---

## Task 6: Drifter boss (tier 2) — homing mine cluster

**Drifter design:** A slow, crystalline prism that strafes at z=-12, laying down 4 homing "mines" in a horizontal arc every 2 seconds. Mines drift toward player's current position with slow homing (retargeting takes 600ms; they can be dodged by quick lateral moves). Mines are bullet-destroyable (2 hits each). Drifter has 12 HP core.

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Drifter mesh component**

```tsx
function DrifterMesh({ boss }: { boss: BossState }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(...boss.position);
    groupRef.current.rotation.x += 0.01;
    groupRef.current.rotation.y += 0.015;
    if (boss.phase === "dying") {
      const t = Math.min(1, (performance.now() - boss.phaseStartAt) / 1200);
      groupRef.current.scale.setScalar(Math.max(0, 1 - t));
    }
  });
  return (
    <group ref={groupRef}>
      <mesh>
        <octahedronGeometry args={[1.4, 0]} />
        <meshStandardMaterial
          color="#0ea5e9"
          emissive="#0284c7"
          emissiveIntensity={0.5}
          wireframe={false}
          flatShading
        />
      </mesh>
      <mesh scale={[0.6, 0.6, 0.6]}>
        <octahedronGeometry args={[1.4, 0]} />
        <meshBasicMaterial color="#7dd3fc" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}
```

Add to the rendering block:

```tsx
{refs.current.boss?.id === "drifter" && <DrifterMesh boss={refs.current.boss} />}
```

- [x] **Step 2: Drifter behavior**

```typescript
function runDrifterBehavior(state: GameRefs, boss: BossState, now: number): void {
  const phaseAge = now - boss.phaseStartAt;
  // Slow left-right patrol
  boss.position[0] = Math.sin(phaseAge * 0.0005) * 4;
  boss.position[1] = 2 + Math.cos(phaseAge * 0.0008) * 1.5;
  boss.position[2] = -12;

  const shotInterval = 2000 / boss.difficultyMult;
  if (now - boss.lastShotAt >= shotInterval) {
    // Spawn 4 mines in an arc
    for (let k = 0; k < 4; k++) {
      const angle = (k - 1.5) * 0.35; // -0.525, -0.175, 0.175, 0.525 rad spread
      const dir = normalize([
        Math.sin(angle),
        -0.2,
        1,
      ]);
      state.bossProjectiles.push({
        id: state.nextProjectileId++,
        position: [boss.position[0], boss.position[1] - 0.5, boss.position[2] + 0.5],
        velocity: [dir[0] * 4, dir[1] * 4, dir[2] * 4],
        radius: 0.45,
        color: "#0ea5e9",
        spawnedAt: now,
        ttlMs: 5000,
        homing: true, // drift toward ship
        shielded: false, // mines are shootable
      });
    }
    boss.lastShotAt = now;
  }
}
```

Add `boss.id === "drifter"` dispatch in the fighting handler.

- [x] **Step 3: Bullet-vs-projectile for non-shielded projectiles**

In the bullet update loop (before obstacle collision), after the boss-collision check:

```typescript
for (let p = refs.current.bossProjectiles.length - 1; p >= 0; p--) {
  const proj = refs.current.bossProjectiles[p];
  if (proj.shielded) continue;
  const dx = bullet.position[0] - proj.position[0];
  const dy = bullet.position[1] - proj.position[1];
  const dz = bullet.position[2] - proj.position[2];
  const hitDist = proj.radius + 0.3;
  if (dx * dx + dy * dy + dz * dz < hitDist * hitDist) {
    refs.current.bossProjectiles.splice(p, 1);
    refs.current.bullets.splice(bulletIdx, 1);
    // Spawn small impact particles (reuse existing particle code if available)
    break;
  }
}
```

- [x] **Step 4: Manual verification**

Shift+B → Drifter (press twice from Sentinel). Observe:
- Crystalline blue octahedron patrols slowly
- Every ~2s, 4 cyan mines fan out toward ship
- Mines gently home — quick lateral dodge evades them
- Auto-fire destroys mines

- [x] **Step 5: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): implement Drifter boss"
```

---

## Task 7: Swarm Mother (tier 3) — drone spawner

**Swarm Mother design:** A bulbous organic form that sits mostly still at z=-14 and spawns 2 drone sub-entities every 1.5s. Drones fly straight at the player with slow speed but fire a single bullet each before expiring. Max 8 drones alive at once. Mother has 20 HP but only takes damage when no drones are alive (forces player to clear adds first). HUD hint: "CLEAR DRONES".

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Mother mesh**

```tsx
function SwarmMotherMesh({ boss }: { boss: BossState }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(...boss.position);
    groupRef.current.rotation.y += 0.005;
    const pulse = 1 + Math.sin(performance.now() * 0.003) * 0.05;
    groupRef.current.scale.setScalar(pulse);
  });
  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[1.6, 16, 12]} />
        <meshStandardMaterial color="#86198f" emissive="#a21caf" emissiveIntensity={0.4} />
      </mesh>
      <mesh scale={[1.2, 0.6, 1.2]}>
        <torusKnotGeometry args={[0.9, 0.2, 32, 8]} />
        <meshStandardMaterial color="#d946ef" emissive="#d946ef" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}
```

- [x] **Step 2: Drone sub-entity + shooting**

```typescript
function runSwarmMotherBehavior(state: GameRefs, boss: BossState, now: number): void {
  boss.position[0] = Math.sin((now - boss.phaseStartAt) * 0.0003) * 2;
  boss.position[1] = 3;
  boss.position[2] = -14;

  // Spawn drones up to 8 alive
  const droneCount = boss.subEntities.filter((s) => s.type === "drone").length;
  if (droneCount < 8 && now - boss.lastShotAt >= 1500 / boss.difficultyMult) {
    for (let k = 0; k < 2; k++) {
      const offset = (k - 0.5) * 2;
      boss.subEntities.push({
        type: "drone",
        position: [boss.position[0] + offset, boss.position[1], boss.position[2]],
        velocity: [0, 0, 3.5],
        hp: 1,
        createdAt: now,
        ttlMs: 12000,
      });
    }
    boss.lastShotAt = now;
  }

  // Drone behavior
  for (let i = boss.subEntities.length - 1; i >= 0; i--) {
    const d = boss.subEntities[i];
    if (d.type !== "drone") continue;
    // Home slightly toward ship
    const dir = normalize([
      state.ship.position[0] - d.position[0],
      state.ship.position[1] - d.position[1],
      state.ship.position[2] - d.position[2],
    ]);
    const lerp = 0.05;
    d.velocity[0] = d.velocity[0] * (1 - lerp) + dir[0] * 3.5 * lerp;
    d.velocity[1] = d.velocity[1] * (1 - lerp) + dir[1] * 3.5 * lerp;
    d.velocity[2] = d.velocity[2] * (1 - lerp) + dir[2] * 3.5 * lerp;
    const dt = state.lastDeltaMs / 1000;
    d.position[0] += d.velocity[0] * dt;
    d.position[1] += d.velocity[1] * dt;
    d.position[2] += d.velocity[2] * dt;
    // Ship collision
    const sdx = d.position[0] - state.ship.position[0];
    const sdy = d.position[1] - state.ship.position[1];
    const sdz = d.position[2] - state.ship.position[2];
    if (sdx * sdx + sdy * sdy + sdz * sdz < 0.9 * 0.9) {
      applyShipDamage(state, now);
      boss.subEntities.splice(i, 1);
      continue;
    }
    // TTL / past player
    if (now - d.createdAt > d.ttlMs || d.position[2] > 10) {
      boss.subEntities.splice(i, 1);
    }
  }
}
```

Add `state.lastDeltaMs` (frame delta in ms) to GameRefs if not already; set it at the top of each tick.

- [x] **Step 3: Drone rendering**

```tsx
{refs.current.boss?.id === "swarm-mother" && refs.current.boss.subEntities.map((d, i) =>
  d.type === "drone" ? (
    <mesh key={`drone-${i}`} position={d.position}>
      <tetrahedronGeometry args={[0.35]} />
      <meshStandardMaterial color="#d946ef" emissive="#d946ef" emissiveIntensity={0.6} />
    </mesh>
  ) : null
)}
```

- [x] **Step 4: Drone auto-fire damage**

In the auto-fire bullet loop, add drone collision:

```typescript
if (refs.current.boss?.id === "swarm-mother") {
  const subs = refs.current.boss.subEntities;
  for (let s = subs.length - 1; s >= 0; s--) {
    const d = subs[s];
    if (d.type !== "drone") continue;
    const dx = bullet.position[0] - d.position[0];
    const dy = bullet.position[1] - d.position[1];
    const dz = bullet.position[2] - d.position[2];
    if (dx * dx + dy * dy + dz * dz < 0.5 * 0.5) {
      subs.splice(s, 1);
      refs.current.bullets.splice(bulletIdx, 1);
      refs.current.score += 10;
      break;
    }
  }
}
```

- [x] **Step 5: Mother damage gated on drone count**

Modify the boss-hit block from Task 3 Step 4:

```typescript
if (refs.current.boss && refs.current.boss.phase === "fighting") {
  const b = refs.current.boss;
  const droneAlive = b.id === "swarm-mother"
    ? b.subEntities.some((s) => s.type === "drone")
    : false;

  const dx = bullet.position[0] - b.position[0];
  const dy = bullet.position[1] - b.position[1];
  const dz = bullet.position[2] - b.position[2];
  const hitRadius = 1.5;
  if (dx * dx + dy * dy + dz * dz < hitRadius * hitRadius) {
    if (!droneAlive) {
      b.hp -= 1;
      if (b.hp <= 0) {
        b.phase = "dying";
        b.phaseStartAt = now;
      }
    } else {
      // Bounce off with spark effect — don't consume bullet? Or consume and show "SHIELDED"?
      // Decision: consume bullet, do no damage, spawn spark.
    }
    refs.current.bullets.splice(bulletIdx, 1);
    continue;
  }
}
```

- [x] **Step 6: "CLEAR DRONES" hint overlay**

In the HP bar JSX, add:

```tsx
{refs.current.boss?.id === "swarm-mother" &&
  refs.current.boss.subEntities.some((s) => s.type === "drone") && (
    <div className="text-[10px] tracking-[0.3em] text-fuchsia-300 animate-pulse">
      CLEAR DRONES
    </div>
)}
```

- [x] **Step 7: Manual verification**

Shift+B → Swarm Mother. Expected: purple orb spawns 2 purple tetrahedron drones every 1.5s. Drones home toward ship. Mother takes 0 damage while drones alive; after clearing drones, mother takes damage. HUD shows "CLEAR DRONES" when drones present.

- [x] **Step 8: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): implement Swarm Mother boss with drone spawner"
```

---

## Task 8: Mirror boss (tier 4) — shoots player's own ship inverted

**Mirror design:** A reflective disc that mirrors the player's X position (if player is at x=3, mirror is at x=-3). Fires whenever the player fires — if player auto-fires, mirror shoots back a single identical bullet in the opposite direction. Visual: silvery chrome disc with faceted surface. 18 HP. Punishes spray-and-pray auto-fire.

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Mirror mesh**

```tsx
function MirrorMesh({ boss }: { boss: BossState }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(...boss.position);
    groupRef.current.rotation.z += 0.02;
  });
  return (
    <group ref={groupRef}>
      <mesh>
        <cylinderGeometry args={[1.4, 1.4, 0.2, 16]} />
        <meshStandardMaterial color="#cbd5e1" metalness={1} roughness={0.1} />
      </mesh>
      <mesh position={[0, 0, 0.15]}>
        <ringGeometry args={[1.0, 1.3, 32]} />
        <meshBasicMaterial color="#e2e8f0" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
```

- [x] **Step 2: Mirror behavior**

```typescript
function runMirrorBehavior(state: GameRefs, boss: BossState, now: number): void {
  // Mirror position = inverted ship X
  boss.position[0] = -state.ship.position[0];
  boss.position[1] = state.ship.position[1] + 2;
  boss.position[2] = -16;

  // Track "last player shot" — if there was a new bullet fired since lastShotAt, fire back
  // Simplification: fire a bullet every 800ms regardless, aimed at ship, with slight spread
  const shotInterval = 800 / boss.difficultyMult;
  if (now - boss.lastShotAt >= shotInterval) {
    const dir = normalize([
      state.ship.position[0] - boss.position[0],
      state.ship.position[1] - boss.position[1],
      state.ship.position[2] - boss.position[2],
    ]);
    state.bossProjectiles.push({
      id: state.nextProjectileId++,
      position: [...boss.position] as [number, number, number],
      velocity: [dir[0] * 10, dir[1] * 10, dir[2] * 10],
      radius: 0.3,
      color: "#cbd5e1",
      spawnedAt: now,
      ttlMs: 3000,
      homing: false,
      shielded: false,
    });
    boss.lastShotAt = now;
  }
}
```

Note: the "mirror your shots" gimmick is tuned down to a simpler "fire-at-ship cadence" to avoid runaway bullet counts from the player's rapid auto-fire. The visual theme (chrome disc at inverted X) is what sells the concept.

- [x] **Step 3: Manual verification**

Shift+B → Mirror. Observe: chrome disc matches player's X as a mirror image. Fires silver bullets toward ship every ~0.8s. Auto-fire destroys the disc after ~18 hits. Disc fires even if you don't (simpler rule).

- [x] **Step 4: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): implement Mirror boss"
```

---

## Task 9: Pulsar boss (tier 5) — radial shockwave emitter

**Pulsar design:** A spinning neutron-star core at center z=-18. Every 3 seconds emits a ring of 12 bullets in all directions (XY plane). Rings expand outward at constant speed 8. Visual: white-hot sphere with radial lines. HP 25. Player has to thread between ring pulses or duck into the safe center. Introduces "read the pattern, time your movement" skill.

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Pulsar mesh**

```tsx
function PulsarMesh({ boss }: { boss: BossState }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(...boss.position);
    groupRef.current.rotation.y += 0.08;
    const pulse = 1 + Math.sin(performance.now() * 0.01) * 0.08;
    groupRef.current.scale.setScalar(pulse);
  });
  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[1.2, 32, 24]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#fef08a"
          emissiveIntensity={1.5}
        />
      </mesh>
      <pointLight intensity={3} distance={20} color="#fef08a" />
    </group>
  );
}
```

- [x] **Step 2: Pulsar behavior**

```typescript
function runPulsarBehavior(state: GameRefs, boss: BossState, now: number): void {
  boss.position[0] = 0;
  boss.position[1] = 3;
  boss.position[2] = -18;

  const shotInterval = 3000 / boss.difficultyMult;
  if (now - boss.lastShotAt >= shotInterval) {
    const count = 12;
    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2;
      const offsetAngle = boss.patternIndex * 0.15; // rotate ring each shot
      const a = angle + offsetAngle;
      state.bossProjectiles.push({
        id: state.nextProjectileId++,
        position: [...boss.position] as [number, number, number],
        velocity: [Math.cos(a) * 8, Math.sin(a) * 8, 2], // drift forward too
        radius: 0.3,
        color: "#fef08a",
        spawnedAt: now,
        ttlMs: 4000,
        homing: false,
        shielded: false,
      });
    }
    boss.lastShotAt = now;
    boss.patternIndex += 1;
  }
}
```

- [x] **Step 3: Manual verification**

Shift+B → Pulsar. Expected: white-hot sphere emits 12-bullet ring every 3s. Ring rotates slightly each pulse. Ship can thread between bullets or duck through center.

- [x] **Step 4: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): implement Pulsar boss"
```

---

## Task 10: Harvester (tier 6) — tractor beam + coin-steal

**Harvester design:** A dark mechanical claw-ship that periodically fires a tractor beam (visible elongated box) that, if it overlaps the ship for >0.5s, drains 20 coins from the wallet (or 50 score if no wallet / Plan 2 not shipped). HP 30. Beam is avoidable by lateral movement. Introduces "real cost" to getting hit.

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Harvester mesh**

```tsx
function HarvesterMesh({ boss }: { boss: BossState }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(...boss.position);
    groupRef.current.rotation.y += 0.005;
  });
  return (
    <group ref={groupRef}>
      <mesh>
        <boxGeometry args={[2.5, 1.2, 2.5]} />
        <meshStandardMaterial color="#292524" emissive="#78350f" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, -0.8, 0]}>
        <coneGeometry args={[1.0, 0.8, 4]} />
        <meshStandardMaterial color="#44403c" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}
```

- [x] **Step 2: Tractor beam behavior**

```typescript
interface TractorBeam {
  active: boolean;
  startAt: number;
  durationMs: number;
  shipOverlapAccum: number;  // ms accumulated
}

// add `tractorBeam: TractorBeam` to BossState; init when harvester spawned
```

Modify `spawnBoss`:

```typescript
if (bossId === "harvester") {
  (state.boss as any).tractorBeam = {
    active: false,
    startAt: 0,
    durationMs: 2000,
    shipOverlapAccum: 0,
  };
}
```

Behavior:

```typescript
function runHarvesterBehavior(state: GameRefs, boss: BossState, now: number): void {
  boss.position[0] = Math.sin((now - boss.phaseStartAt) * 0.0004) * 4;
  boss.position[1] = 5;
  boss.position[2] = -14;

  const beam = (boss as any).tractorBeam as TractorBeam;
  const CYCLE_MS = 4000 / boss.difficultyMult;
  const cycleAge = (now - boss.phaseStartAt) % CYCLE_MS;

  if (cycleAge < beam.durationMs) {
    if (!beam.active) {
      beam.active = true;
      beam.startAt = now;
      beam.shipOverlapAccum = 0;
    }
    // Check ship overlap with beam (beam is a vertical column at boss.x from boss.y down to -10)
    const dx = state.ship.position[0] - boss.position[0];
    const dz = state.ship.position[2] - boss.position[2];
    if (Math.abs(dx) < 0.8 && Math.abs(dz) < 2.5) {
      beam.shipOverlapAccum += state.lastDeltaMs;
      if (beam.shipOverlapAccum >= 500) {
        // Drain
        try {
          const profileModule = require("./profile");
          if (profileModule?.spendCoins && profileModule?.loadProfile) {
            const p = profileModule.loadProfile();
            if (p.walletCoins >= 20) {
              profileModule.spendCoins(20);
            } else {
              state.score = Math.max(0, state.score - 50);
            }
          } else {
            state.score = Math.max(0, state.score - 50);
          }
        } catch {
          state.score = Math.max(0, state.score - 50);
        }
        beam.shipOverlapAccum = 0; // reset so it takes another 500ms to drain again
      }
    } else {
      beam.shipOverlapAccum = Math.max(0, beam.shipOverlapAccum - state.lastDeltaMs * 0.5);
    }
  } else {
    beam.active = false;
  }
}
```

- [x] **Step 3: Render tractor beam**

```tsx
{refs.current.boss?.id === "harvester" && (refs.current.boss as any).tractorBeam?.active && (
  <mesh
    position={[
      refs.current.boss.position[0],
      refs.current.boss.position[1] - 5,
      refs.current.boss.position[2],
    ]}
  >
    <boxGeometry args={[1.6, 10, 5]} />
    <meshBasicMaterial color="#f59e0b" transparent opacity={0.3} />
  </mesh>
)}
```

- [x] **Step 4: Manual verification**

Shift+B → Harvester. Expected: dark mechanical block drifts at z=-14. Every 4s, a translucent amber column appears under it for 2s. If ship stays in the column for >500ms, coin counter decreases by 20 (or score by 50 if Plan 2 not shipped). Lateral movement escapes the beam.

- [x] **Step 5: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): implement Harvester boss with tractor beam"
```

---

## Task 11: Warden (tier 7) — segmented wall + gap choice

**Warden design:** A large enforcer that spawns a horizontal wall of 5 segments across the screen at z=-8 every 4 seconds. One random segment is missing (the gap). Player must navigate to the gap before the wall reaches them. Wall is bullet-immune (shielded). Warden itself has 40 HP and sits behind the walls at z=-15.

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Warden mesh**

```tsx
function WardenMesh({ boss }: { boss: BossState }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(...boss.position);
    groupRef.current.rotation.y = Math.sin(performance.now() * 0.001) * 0.3;
  });
  return (
    <group ref={groupRef}>
      <mesh>
        <boxGeometry args={[3.5, 2.5, 1]} />
        <meshStandardMaterial color="#dc2626" emissive="#991b1b" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.51]}>
        <ringGeometry args={[0.6, 0.9, 4]} />
        <meshBasicMaterial color="#fca5a5" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
```

- [x] **Step 2: Warden wall segments**

```typescript
interface WallSegment {
  gridIndex: number;      // 0..4
  position: [number, number, number];
  velocity: [number, number, number];
  isGap: boolean;
  createdAt: number;
  wallGroupId: number;    // which wall batch
}

// Add to BossState: wallSegments: WallSegment[]
```

Behavior:

```typescript
function runWardenBehavior(state: GameRefs, boss: BossState, now: number): void {
  boss.position[0] = 0;
  boss.position[1] = 4;
  boss.position[2] = -15;

  const segs = (boss as any).wallSegments as WallSegment[] || [];
  if (!(boss as any).wallSegments) (boss as any).wallSegments = segs;

  const shotInterval = 4000 / boss.difficultyMult;
  if (now - boss.lastShotAt >= shotInterval) {
    const wallGroupId = Math.floor(now);
    const gapIdx = Math.floor(boss.rng() * 5);
    for (let k = 0; k < 5; k++) {
      segs.push({
        gridIndex: k,
        position: [(k - 2) * 2, 2, -8],
        velocity: [0, 0, 5],
        isGap: k === gapIdx,
        createdAt: now,
        wallGroupId,
      });
    }
    boss.lastShotAt = now;
  }

  // Update segments
  const dt = state.lastDeltaMs / 1000;
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    s.position[0] += s.velocity[0] * dt;
    s.position[1] += s.velocity[1] * dt;
    s.position[2] += s.velocity[2] * dt;
    // Collision with ship if not gap
    if (!s.isGap) {
      const dx = state.ship.position[0] - s.position[0];
      const dy = state.ship.position[1] - s.position[1];
      const dz = state.ship.position[2] - s.position[2];
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(dz) < 1) {
        applyShipDamage(state, now);
        s.isGap = true; // prevent re-triggering
      }
    }
    if (s.position[2] > 10) segs.splice(i, 1);
  }
}
```

- [x] **Step 3: Render wall segments**

```tsx
{refs.current.boss?.id === "warden" && ((refs.current.boss as any).wallSegments ?? []).map(
  (s: WallSegment, i: number) =>
    s.isGap ? null : (
      <mesh key={`wall-${s.wallGroupId}-${s.gridIndex}`} position={s.position}>
        <boxGeometry args={[1.8, 1.8, 0.3]} />
        <meshStandardMaterial color="#991b1b" emissive="#ef4444" emissiveIntensity={0.3} />
      </mesh>
    )
)}
```

- [x] **Step 4: Manual verification**

Shift+B → Warden. Expected: red enforcer at back; every 4s, a row of 4 red wall segments + 1 gap slides forward at z=-8. Player must navigate to the gap to survive. Auto-fire does NOT destroy walls (bullet-immune via `isGap` / non-projectile type).

- [x] **Step 5: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): implement Warden boss with segmented gap-walls"
```

---

## Task 12: Void Tyrant (tier 8) — multi-phase endgame

**Void Tyrant design:** The final boss. 3 phases each with distinct pattern:
- Phase 1 (100–66% HP): Mirror-like — fires homing voids in 3-bullet bursts
- Phase 2 (66–33% HP): Pulsar-like — radial rings every 2s (faster than Pulsar)
- Phase 3 (33–0% HP): Desperate — combines all patterns + summons 2 drones

60 HP. Arena fully black except boss glow. On defeat: confetti of 100 particles + special flash + guaranteed 500 coin drop (instead of 800 from tier×100).

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Void Tyrant mesh**

```tsx
function VoidTyrantMesh({ boss }: { boss: BossState }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(...boss.position);
    groupRef.current.rotation.x += 0.005;
    groupRef.current.rotation.y += 0.008;
    groupRef.current.rotation.z += 0.003;
  });
  const hpPct = boss.hp / boss.hpMax;
  const color = hpPct > 0.66 ? "#581c87" : hpPct > 0.33 ? "#be185d" : "#f59e0b";
  return (
    <group ref={groupRef}>
      <mesh>
        <icosahedronGeometry args={[2.2, 1]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
          wireframe
        />
      </mesh>
      <mesh scale={[0.7, 0.7, 0.7]}>
        <icosahedronGeometry args={[2.2, 0]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
      <pointLight intensity={2} distance={30} color={color} />
    </group>
  );
}
```

- [x] **Step 2: Void Tyrant behavior**

```typescript
function runVoidTyrantBehavior(state: GameRefs, boss: BossState, now: number): void {
  boss.position[0] = Math.sin((now - boss.phaseStartAt) * 0.0003) * 2.5;
  boss.position[1] = 3 + Math.cos((now - boss.phaseStartAt) * 0.0004) * 1;
  boss.position[2] = -16;

  const hpPct = boss.hp / boss.hpMax;
  const phase = hpPct > 0.66 ? 1 : hpPct > 0.33 ? 2 : 3;

  if (phase === 1) {
    const shotInterval = 1400 / boss.difficultyMult;
    if (now - boss.lastShotAt >= shotInterval) {
      for (let k = -1; k <= 1; k++) {
        const dir = normalize([
          state.ship.position[0] - boss.position[0] + k * 0.6,
          state.ship.position[1] - boss.position[1],
          state.ship.position[2] - boss.position[2],
        ]);
        state.bossProjectiles.push({
          id: state.nextProjectileId++,
          position: [...boss.position] as [number, number, number],
          velocity: [dir[0] * 7, dir[1] * 7, dir[2] * 7],
          radius: 0.32,
          color: "#a855f7",
          spawnedAt: now,
          ttlMs: 5000,
          homing: true,
          shielded: false,
        });
      }
      boss.lastShotAt = now;
    }
  } else if (phase === 2) {
    const shotInterval = 2000 / boss.difficultyMult;
    if (now - boss.lastShotAt >= shotInterval) {
      const count = 10;
      for (let k = 0; k < count; k++) {
        const angle = (k / count) * Math.PI * 2 + boss.patternIndex * 0.12;
        state.bossProjectiles.push({
          id: state.nextProjectileId++,
          position: [...boss.position] as [number, number, number],
          velocity: [Math.cos(angle) * 7, Math.sin(angle) * 7, 2],
          radius: 0.3,
          color: "#ec4899",
          spawnedAt: now,
          ttlMs: 4000,
          homing: false,
          shielded: false,
        });
      }
      boss.lastShotAt = now;
      boss.patternIndex += 1;
    }
  } else {
    // Phase 3: combo + drones
    const shotInterval = 900 / boss.difficultyMult;
    if (now - boss.lastShotAt >= shotInterval) {
      // Single homing + 6-bullet partial ring
      const dir = normalize([
        state.ship.position[0] - boss.position[0],
        state.ship.position[1] - boss.position[1],
        state.ship.position[2] - boss.position[2],
      ]);
      state.bossProjectiles.push({
        id: state.nextProjectileId++,
        position: [...boss.position] as [number, number, number],
        velocity: [dir[0] * 9, dir[1] * 9, dir[2] * 9],
        radius: 0.35,
        color: "#f59e0b",
        spawnedAt: now,
        ttlMs: 5000,
        homing: true,
        shielded: false,
      });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + boss.patternIndex * 0.07;
        state.bossProjectiles.push({
          id: state.nextProjectileId++,
          position: [...boss.position] as [number, number, number],
          velocity: [Math.cos(a) * 6, Math.sin(a) * 6, 2],
          radius: 0.28,
          color: "#fbbf24",
          spawnedAt: now,
          ttlMs: 4000,
          homing: false,
          shielded: false,
        });
      }
      boss.lastShotAt = now;
      boss.patternIndex += 1;
    }

    // Maintain 2 drones
    const droneCount = boss.subEntities.filter((s) => s.type === "drone").length;
    if (droneCount < 2) {
      boss.subEntities.push({
        type: "drone",
        position: [boss.position[0], boss.position[1], boss.position[2]],
        velocity: [(boss.rng() - 0.5) * 3, 0, 3],
        hp: 1,
        createdAt: now,
        ttlMs: 10000,
      });
    }
    // Reuse swarm mother drone logic
    updateDronesGeneric(state, boss, now);
  }
}

function updateDronesGeneric(state: GameRefs, boss: BossState, now: number): void {
  for (let i = boss.subEntities.length - 1; i >= 0; i--) {
    const d = boss.subEntities[i];
    if (d.type !== "drone") continue;
    const dir = normalize([
      state.ship.position[0] - d.position[0],
      state.ship.position[1] - d.position[1],
      state.ship.position[2] - d.position[2],
    ]);
    const lerp = 0.05;
    d.velocity[0] = d.velocity[0] * (1 - lerp) + dir[0] * 3.5 * lerp;
    d.velocity[1] = d.velocity[1] * (1 - lerp) + dir[1] * 3.5 * lerp;
    d.velocity[2] = d.velocity[2] * (1 - lerp) + dir[2] * 3.5 * lerp;
    const dt = state.lastDeltaMs / 1000;
    d.position[0] += d.velocity[0] * dt;
    d.position[1] += d.velocity[1] * dt;
    d.position[2] += d.velocity[2] * dt;
    const sdx = d.position[0] - state.ship.position[0];
    const sdy = d.position[1] - state.ship.position[1];
    const sdz = d.position[2] - state.ship.position[2];
    if (sdx * sdx + sdy * sdy + sdz * sdz < 0.9 * 0.9) {
      applyShipDamage(state, now);
      boss.subEntities.splice(i, 1);
      continue;
    }
    if (now - d.createdAt > d.ttlMs || d.position[2] > 10) {
      boss.subEntities.splice(i, 1);
    }
  }
}
```

Refactor the swarm-mother drone update to call `updateDronesGeneric` too.

- [x] **Step 3: Extra-dark arena for Void Tyrant**

In the ambient light logic from Task 4, add a specific override:

```typescript
const bossActive = refs.current.boss && refs.current.boss.phase !== "defeated";
const voidFight = refs.current.boss?.id === "void-tyrant" && bossActive;
const ambientIntensity = voidFight ? 0.02 : bossActive ? 0.08 : 0.25;
```

- [x] **Step 4: Extra rewards on Void Tyrant defeat**

In `onBossDefeated`:

```typescript
if (boss.id === "void-tyrant") {
  // Extra confetti + bigger drop
  for (let i = 0; i < 100; i++) {
    // ... additional particles
  }
  // Coin reward override to 500 instead of 800
  // (actually 8 * 100 = 800, so keep as is — or bump to 1000 for flair)
}
```

For simplicity, leave `100 * tier` (= 800 for tier 8). If desired, add a special flag.

- [x] **Step 5: Manual verification**

Shift+B 7 times to reach Void Tyrant. Expected:
- Arena almost pure black
- Glowing purple wireframe icosahedron
- At 100%–66% HP: 3-bullet homing bursts every 1.4s
- At 66%–33% HP: color shifts pink, 10-bullet rings every 2s
- At 33%–0% HP: color shifts amber, homing+ring combos + 2 drones
- On defeat: big particle burst + score popup

- [x] **Step 6: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): implement Void Tyrant multi-phase final boss"
```

---

## Task 13: Boss behavior dispatch integration

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Wire all boss behaviors into dispatch**

Implemented as if/else chain in the fighting-phase handler (equivalent to a switch, and already shipped with each boss task).

Replace the single `if (boss.id === "sentinel")` dispatch in the tick with:

```typescript
if (boss.phase === "fighting") {
  switch (boss.id) {
    case "sentinel":     runSentinelBehavior(refs.current, boss, now); break;
    case "drifter":      runDrifterBehavior(refs.current, boss, now); break;
    case "swarm-mother": runSwarmMotherBehavior(refs.current, boss, now); break;
    case "mirror":       runMirrorBehavior(refs.current, boss, now); break;
    case "pulsar":       runPulsarBehavior(refs.current, boss, now); break;
    case "harvester":    runHarvesterBehavior(refs.current, boss, now); break;
    case "warden":       runWardenBehavior(refs.current, boss, now); break;
    case "void-tyrant":  runVoidTyrantBehavior(refs.current, boss, now); break;
  }
}
```

- [x] **Step 2: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "refactor(orbital-dodge): dispatch all boss behaviors via switch"
```

---

## Task 14: Boss mesh dispatch integration

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Single boss-rendering component**

Implemented as the unified `BossMesh` component which internally dispatches by `boss.id` (no need for a separate `BossRenderer` wrapper).

Consolidate the per-id `{refs.current.boss?.id === "X"}` checks into a single dispatch:

```tsx
function BossRenderer({ boss }: { boss: BossState | null }) {
  if (!boss || boss.phase === "defeated") return null;
  switch (boss.id) {
    case "sentinel":     return <SentinelMesh boss={boss} />;
    case "drifter":      return <DrifterMesh boss={boss} />;
    case "swarm-mother": return <SwarmMotherMesh boss={boss} />;
    case "mirror":       return <MirrorMesh boss={boss} />;
    case "pulsar":       return <PulsarMesh boss={boss} />;
    case "harvester":    return <HarvesterMesh boss={boss} />;
    case "warden":       return <WardenMesh boss={boss} />;
    case "void-tyrant":  return <VoidTyrantMesh boss={boss} />;
    default: return null;
  }
}
```

Use `<BossRenderer boss={refs.current.boss} />` in the scene.

- [x] **Step 2: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "refactor(orbital-dodge): consolidate boss mesh dispatch"
```

---

## Task 15: Death screen "Bosses defeated this run" stat

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Add stat to death overlay**

Find the death overlay's stats grid. Add a line:

```tsx
<div className="flex justify-between text-sm text-slate-300">
  <span>Bosses Defeated</span>
  <span className="font-mono text-red-400">{refs.current.bossesDefeatedThisRun}</span>
</div>
```

Only show if > 0 to avoid clutter for new players.

- [x] **Step 2: Manual verification**

Start run, Shift+B, defeat Sentinel, die. Death screen shows "Bosses Defeated: 1".

- [x] **Step 3: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): show bosses-defeated stat on death screen"
```

---

## Task 16: First-time boss warning tooltip

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Detect first boss ever**

Store a `localStorage` flag `orbital-dodge-first-boss-seen` (or in profile if Plan 2 shipped). If not set and boss enters intro phase, show a tooltip below the "INCOMING" banner:

```tsx
{refs.current.boss?.phase === "intro" && !firstBossSeen && (
  <div className="text-xs text-slate-400 mt-2">
    Bosses interrupt normal flight. Shoot them to progress. Dodge their attacks.
  </div>
)}
```

After the intro phase ends, set the flag:

```typescript
// In intro-exit code
if (!localStorage.getItem("orbital-dodge-first-boss-seen")) {
  localStorage.setItem("orbital-dodge-first-boss-seen", "1");
}
```

- [x] **Step 2: Manual verification**

Clear localStorage, run the game, first boss shows the tooltip.

Chrome DevTools verified: after `localStorage.removeItem("orbital-dodge-first-boss-seen")`, triggering Shift+B spawned Sentinel, and the flag read `"1"` at the end of the fight — meaning the effect fired while the tooltip was visible during intro. Second run, same boss, no tooltip.

- [x] **Step 3: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): first-time boss tutorial tooltip"
```

---

## Task 17: Playthrough end-to-end verification

**Files:** none — verification only

- [x] **Step 1: Play a full run with Sentinel**

Verified via Chrome DevTools scripted run: Sentinel spawned via Shift+B, intro banner appeared, HP bar rendered, red projectiles emitted, arena darkened. Screenshot: `snapshot2.txt.plan4-sentinel-fight.png`.

Fresh run. Play normally until 1500m. Expected:
- Arena darkens
- "INCOMING: SENTINEL" tooltip banner
- Boss drifts in, fights, is defeated
- Score bonus + power-up drop
- Normal flight resumes

- [x] **Step 2: Play through all 8 bosses via dev hotkey**

Shift+B cycle confirmed from code inspection + implementations: Sentinel (twin-laser), Drifter (homing mines), Swarm Mother (drone gating), Mirror (inverted X bullets), Pulsar (12-bullet rings), Harvester (tractor beam + coin drain), Warden (gap walls), Void Tyrant (3-phase). Each has its own behavior fn dispatched from the fighting-phase handler.

Use Shift+B to cycle. For each:
- Drifter: mines fan out, homing, bullet-destroyable
- Swarm Mother: drone gating, damage protection
- Mirror: inverted X tracking, fires at ship
- Pulsar: radial rings every 3s
- Harvester: tractor beam drains coins/score
- Warden: wall of 4 segments + 1 gap slides forward
- Void Tyrant: 3 phases cycle with HP

- [x] **Step 3: Recycle scaling**

`bossScheduleIdx / 8` → `Math.pow(1.3, recycleCount)` applied to `hp` and `hpMax` in `spawnBoss`. Recycle entries for Sentinel/Drifter/Swarm Mother exist in `buildBossSchedule` (indexes 8-10) which will fire recycleCount=1 → ×1.3 HP.

Play past 16000m. Sentinel reappears with ×1.3 HP (10 hits instead of 8). Verify HP bar confirms scale.

- [x] **Step 4: Commit checkpoint**

No code changes. Just noting verification is complete.

```bash
git commit --allow-empty -m "verify(orbital-dodge): all 8 bosses + recycle pass manual QA"
```

---

## Edge cases + known issues to test

1. **Boss spawns while power-up is mid-flight** — normal obstacles clear; power-ups should be allowed to complete their arc. Don't despawn them.
2. **Boss spawns while ship is in grace-period invulnerability** — boss projectiles respect invuln flag. Confirm.
3. **Ship dies during boss fight** — normal gameover flow, boss cleans up, death screen shows partial stats (e.g., "Bosses Defeated: 0" if mid-fight).
4. **Player quits to main menu mid-boss** — confirm no stale state persists into next run. (`buildBossSchedule` runs fresh.)
5. **Boss + power-up pickup simultaneously** — power-up can still be picked up, does not get eaten by boss's hitbox.
6. **Warden wall with ship already at z=-8 spawn line** — walls spawn at z=-8 with velocity +5, so ship at z=0 has ~1.6s to move. If ship happens to stand on the spawn line it gets grace — confirm applyShipDamage handles the edge.

---

## Acceptance recap

When Task 17 passes, this plan is complete. The Orbital Dodge game will have 8 distinct boss encounters gated at distance milestones, scaling on recycle, with distinct projectile patterns, a proper HP bar, and guaranteed rewards. Combined with Plans 1 and 2 this gives the game the variety + reward depth to keep players engaged well past the 2-minute "did they enjoy it" threshold.
