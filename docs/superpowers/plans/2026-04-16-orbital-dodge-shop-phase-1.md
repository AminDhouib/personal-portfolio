# Plan 2 — Shop Phase 1 (Coins + Wallet + 5 Upgrades + First-Timer Gating)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the core retention loop — coins drop during play, a persistent wallet stores them, and a shop modal lets returning players spend on 5 permanent gameplay upgrades. New visitors see the game exactly as it is today; the shop UI only appears after the first death.

**Architecture:** New file `src/components/game/profile.ts` owns localStorage I/O for the whole profile schema. New file `src/components/game/shop-data.ts` defines the upgrade catalog (id, tier costs, effect formula). Coin entity piggybacks on the existing power-up rendering pattern (sprites with lateral drift). Upgrades are applied once at `startRun` — never mid-run — so the game's per-frame logic stays clean. Shop UI is a modal portal rendered inside the canvas container.

**Tech Stack:** TypeScript, React 19, `@react-three/fiber`, framer-motion, Three.js. No new deps.

**Verification:** Chrome DevTools MCP — automated script that plays a run, collects coins, confirms wallet grows in localStorage, opens shop, buys an upgrade, starts a new run, confirms upgrade is applied via measurable effect (e.g., +20% coin value).

**Depends on:** Plan 1 (combo multiplier). Coin drops scale with combo, so Plan 1 must ship first.

---

## File Structure

- **Create:** `src/components/game/profile.ts` — single source of truth for localStorage profile. Exports `loadProfile()`, `saveProfile()`, `addCoins(n)`, `spendCoins(n) → boolean`, `markFirstRunCompleted()`, `setUpgradeLevel(id, level)`. Internally handles schema versioning and migrations.
- **Create:** `src/components/game/shop-data.ts` — upgrade catalog: array of `UpgradeDef` entries with `id`, `label`, `description`, `maxLevel`, `costAtLevel(level)`, `effectAtLevel(level) → number`, `icon` key. Pure data; no React.
- **Modify:** `src/components/game/space-shooter.tsx` — add coin entity type + spawn + collect logic, read profile at run start, apply upgrade effects, render shop button in armed overlay for returning players, render shop modal when open.

---

### Task 1: Create the profile module

**Files:**
- Create: `src/components/game/profile.ts`

**Why:** Every downstream plan reads/writes this profile. Centralizing it in one module with a version field lets us add fields additively in later plans without touching every consumer.

- [x] **Step 1: Create the file with the full schema and helpers**

```ts
// src/components/game/profile.ts
//
// Persistent per-player profile stored in localStorage under a single key.
// All profile state for Orbital Dodge lives here — no other file writes to
// the profile key directly. Schema is versioned so we can migrate additively.

const STORAGE_KEY = "orbital-dodge-profile";
const CURRENT_VERSION = 1;

export interface Profile {
  v: number;
  firstRunCompleted: boolean;
  totalRunsPlayed: number;
  totalCoinsEarned: number;
  walletCoins: number;
  totalAsteroidsDestroyed: number;
  totalDistance: number;
  totalBossesDefeated: number;
  ownedUpgrades: Record<string, number>;
  ownedCosmetics: string[];
  equippedShip: string;
  equippedHull: string | null;
  equippedEngine: string | null;
  equippedDeathFx: string | null;
  unlockedAchievements: string[];
  consumableInventory: Record<string, number>;
  missionsToday: { id: string; progress: number; claimed: boolean }[];
  missionsResetDate: string;
  tutorialComplete: boolean;
}

function defaultProfile(): Profile {
  return {
    v: CURRENT_VERSION,
    firstRunCompleted: false,
    totalRunsPlayed: 0,
    totalCoinsEarned: 0,
    walletCoins: 500, // starting gift so first purchases feel immediate
    totalAsteroidsDestroyed: 0,
    totalDistance: 0,
    totalBossesDefeated: 0,
    ownedUpgrades: {},
    ownedCosmetics: [],
    equippedShip: "falcon",
    equippedHull: null,
    equippedEngine: null,
    equippedDeathFx: null,
    unlockedAchievements: [],
    consumableInventory: {},
    missionsToday: [],
    missionsResetDate: "",
    tutorialComplete: false,
  };
}

export function loadProfile(): Profile {
  if (typeof window === "undefined") return defaultProfile();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed) return defaultProfile();
    // Merge with defaults so new fields introduced in later plans get sane values
    return { ...defaultProfile(), ...parsed, v: CURRENT_VERSION };
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(p: Profile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Storage may be full or blocked; fail silently.
  }
}

export function addCoins(n: number): Profile {
  const p = loadProfile();
  p.walletCoins += n;
  p.totalCoinsEarned += n;
  saveProfile(p);
  return p;
}

export function spendCoins(n: number): { ok: boolean; profile: Profile } {
  const p = loadProfile();
  if (p.walletCoins < n) return { ok: false, profile: p };
  p.walletCoins -= n;
  saveProfile(p);
  return { ok: true, profile: p };
}

export function markFirstRunCompleted(): Profile {
  const p = loadProfile();
  if (!p.firstRunCompleted) {
    p.firstRunCompleted = true;
    saveProfile(p);
  }
  return p;
}

export function incrementRunsPlayed(): Profile {
  const p = loadProfile();
  p.totalRunsPlayed += 1;
  saveProfile(p);
  return p;
}

export function addRunStats(stats: {
  asteroidsDestroyed: number;
  distance: number;
}): Profile {
  const p = loadProfile();
  p.totalAsteroidsDestroyed += stats.asteroidsDestroyed;
  p.totalDistance += stats.distance;
  saveProfile(p);
  return p;
}

export function setUpgradeLevel(upgradeId: string, level: number): Profile {
  const p = loadProfile();
  p.ownedUpgrades[upgradeId] = level;
  saveProfile(p);
  return p;
}

export function getUpgradeLevel(upgradeId: string): number {
  return loadProfile().ownedUpgrades[upgradeId] ?? 0;
}
```

- [x] **Step 2: Type check**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx tsc --noEmit
```

Expected: no errors mentioning `profile.ts`.

- [x] **Step 3: Lint**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx eslint src/components/game/profile.ts
```

Expected: clean.

- [x] **Step 4: Commit**

```bash
git add src/components/game/profile.ts
git commit -m "feat(orbital-dodge): add persistent profile module (wallet + upgrades)"
```

---

### Task 2: Create the upgrade catalog

**Files:**
- Create: `src/components/game/shop-data.ts`

**Why:** 5 core permanent upgrades in Phase 1. Each has 5 levels with escalating cost and effect. Data-only module — no React, no imports from game — so it can be read from anywhere.

- [x] **Step 1: Create the catalog file**

```ts
// src/components/game/shop-data.ts
//
// Upgrade catalog for the Orbital Dodge shop. Pure data. Any code that
// applies an upgrade effect calls `effectAtLevel(id, level)` — no hardcoded
// effect values outside this file.

export type UpgradeId =
  | "coin-magnet"
  | "coin-value"
  | "score-multiplier"
  | "combo-window"
  | "shield-duration";

export interface UpgradeDef {
  id: UpgradeId;
  label: string;
  description: string;
  maxLevel: number;
  // Cost to buy level (1..maxLevel). level=1 means first purchase, level=5 means fully maxed.
  costAtLevel(level: number): number;
  // Numeric effect at a given owned level (0 = not owned = baseline).
  // Consumers decide how to apply: multiplier, additive, seconds, etc.
  effectAtLevel(level: number): number;
  // Icon picker — consumers map these to lucide-react imports.
  iconKey: "magnet" | "coins" | "trophy" | "timer" | "shield";
}

// Cost curve used by most upgrades: 100 / 300 / 800 / 2000 / 5000
function stdCost(level: number): number {
  const table = [0, 100, 300, 800, 2000, 5000];
  return table[Math.max(0, Math.min(level, table.length - 1))];
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: "coin-magnet",
    label: "Coin Magnet",
    description: "Coin pickup radius increases so fewer coins fly past.",
    maxLevel: 5,
    costAtLevel: stdCost,
    // Level 0 = 1.0x radius. Level 5 = 3.0x radius.
    effectAtLevel: (lvl) => 1 + lvl * 0.4,
    iconKey: "magnet",
  },
  {
    id: "coin-value",
    label: "Coin Value",
    description: "Every coin is worth more points toward your wallet.",
    maxLevel: 5,
    costAtLevel: stdCost,
    // Level 0 = 1 coin per pickup. Level 5 = 6 coins per pickup.
    effectAtLevel: (lvl) => 1 + lvl,
    iconKey: "coins",
  },
  {
    id: "score-multiplier",
    label: "Score Boost",
    description: "All score earned is multiplied at run's end.",
    maxLevel: 5,
    costAtLevel: stdCost,
    // Level 0 = 1.0x. Level 5 = 2.0x total.
    effectAtLevel: (lvl) => 1 + lvl * 0.2,
    iconKey: "trophy",
  },
  {
    id: "combo-window",
    label: "Combo Sustain",
    description: "Combo multiplier holds longer between kills.",
    maxLevel: 5,
    costAtLevel: stdCost,
    // Level 0 = 4s. Level 5 = 9s. Seconds value.
    effectAtLevel: (lvl) => 4 + lvl,
    iconKey: "timer",
  },
  {
    id: "shield-duration",
    label: "Shield Duration",
    description: "Shield power-up lasts longer after pickup.",
    maxLevel: 5,
    costAtLevel: stdCost,
    // Level 0 = 8s (POWERUP_DURATION_MS). Level 5 = 13.5s.
    effectAtLevel: (lvl) => 8000 + lvl * 1100,
    iconKey: "shield",
  },
];

export function upgradeById(id: UpgradeId): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}
```

- [x] **Step 2: Type check + lint**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx eslint src/components/game/shop-data.ts && npx tsc --noEmit
```

Expected: clean.

- [x] **Step 3: Commit**

```bash
git add src/components/game/shop-data.ts
git commit -m "feat(orbital-dodge): add shop upgrade catalog (5 upgrades, 5 levels each)"
```

---

### Task 3: Add Coin entity + rendering

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

**Why:** Coins are the currency — they drop during play at a rate proportional to combo. Visually distinct from power-ups (smaller, yellow, no halo).

- [x] **Step 1: Add `Coin` interface**

Near the other entity interfaces (e.g., `PowerUp`):

```ts
interface Coin {
  id: number;
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  value: number; // how many coins this token is worth (scales with combo)
}
```

- [x] **Step 2: Extend `GameRefs`**

Inside `GameRefs`:

```ts
  powerUps: PowerUp[];
  coins: Coin[];
  activePowerUps: ActivePowerUp[];
```

And a per-run counter for UI:

```ts
  coinsThisRun: number;
```

- [x] **Step 3: Initialize in `createRefs`**

```ts
    powerUps: [], coins: [], activePowerUps: [], debris: [], scorePopups: [],
    // ...
    coinsThisRun: 0,
```

- [x] **Step 4: Reset in `launch`**

```ts
    g.powerUps.length = 0;
    g.coins.length = 0;
    g.coinsThisRun = 0;
```

- [x] **Step 5: Add spawn helper**

Near `spawnPowerUp`:

```ts
// Coins drop from destroyed asteroids. Value scales with combo so skilled
// play earns more currency.
function spawnCoin(g: GameRefs, x: number, y: number, z: number, value: number) {
  g.coins.push({
    id: nextId(g),
    x, y, z,
    rx: 0, ry: 0, rz: 0,
    value,
  });
}
```

- [x] **Step 6: Spawn coin on asteroid destroy**

In the asteroid-kill block inside `runTick` (the one you edited in Plan 1 Task 3), after `g.kills += 1;` add:

```ts
          // Drop coins scaled by current combo. 1 baseline + 1 per 5 combo.
          const coinValue = 1 + Math.floor(g.combo / 5);
          spawnCoin(g, o.x, o.y, o.z, coinValue);
```

- [x] **Step 7: Move and collect coins each frame**

In the obstacle-movement loop area of `runTick`, after the obstacles loop closes, add:

```ts
  // Coins: drift toward camera, get pulled by magnet, collect on proximity
  const magnetBonusRadius = g.coinMagnetExtra;
  for (let i = g.coins.length - 1; i >= 0; i--) {
    const c = g.coins[i];
    c.z += 8 * step * obstacleSpeedMul;
    c.rx += step * 2;
    c.ry += step * 2.5;
    // Despawn if past camera
    if (c.z > DESPAWN_Z) {
      g.coins.splice(i, 1);
      continue;
    }
    // Magnet pull while in the active play band
    if (c.z > -4 && c.z < 4) {
      const dx = g.shipX - c.x;
      const dy = g.shipY - c.y;
      const dist2d = Math.sqrt(dx * dx + dy * dy);
      const pullRadius = 1.5 + magnetBonusRadius;
      if (dist2d < pullRadius) {
        const pull = step * 6;
        c.x += (dx / (dist2d || 1)) * pull;
        c.y += (dy / (dist2d || 1)) * pull;
      }
      // Collect
      const pickupR = 0.6 + magnetBonusRadius * 0.3;
      if (Math.abs(c.z - g.shipZ) < 1.2 && dist2d < pickupR) {
        g.coinsThisRun += c.value;
        spawnScorePopup(g, c.x, c.y, c.z, c.value);
        sounds.play("chime");
        g.coins.splice(i, 1);
      }
    }
  }
```

Note: this references `g.coinMagnetExtra` — a field added in Task 5 (upgrade application).

- [x] **Step 8: Add `coinMagnetExtra` + `coinValueBonus` to `GameRefs`**

```ts
  // Upgrade-derived run modifiers, set at startRun.
  coinMagnetExtra: number;   // world units added to coin pickup radius
  coinValueBonus: number;    // added to each coin's base value
  scoreMultiplier: number;   // multiplies final score
  comboWindowMs: number;     // overrides COMBO_WINDOW_MS when > 0
  shieldDurationMs: number;  // overrides POWERUP_DURATION_MS for shield when > 0
```

Initialize in `createRefs`:

```ts
    coinMagnetExtra: 0,
    coinValueBonus: 0,
    scoreMultiplier: 1,
    comboWindowMs: 0,
    shieldDurationMs: 0,
```

Reset in `launch` (same values).

- [x] **Step 9: Render coin sprites in R3F**

Create a new `Coins` component (follow the `PowerUps` component pattern):

```tsx
function Coins({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const list = gameRefs.current?.coins ?? [];
  const geo = useMemo(() => new THREE.SphereGeometry(0.18, 12, 10), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const refs = useRef<Map<number, THREE.Group>>(new Map());

  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    for (const c of g.coins) {
      const grp = refs.current.get(c.id);
      if (grp) {
        grp.position.set(c.x, c.y, c.z);
        grp.rotation.set(c.rx, c.ry, c.rz);
      }
    }
  });

  return (
    <group>
      {list.map((c) => (
        <group
          key={c.id}
          ref={(el) => {
            if (el) refs.current.set(c.id, el);
            else refs.current.delete(c.id);
          }}
        >
          <mesh geometry={geo} scale={1.2}>
            <meshToonMaterial color="#fde047" emissive="#ca8a04" emissiveIntensity={0.6} />
          </mesh>
          <pointLight color="#fde047" intensity={0.4} distance={1.5} />
        </group>
      ))}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}
```

- [x] **Step 10: Mount `<Coins />` in the `Scene` block**

Inside the `Scene` function return, alongside `<PowerUps ... />`:

```tsx
      <Coins gameRefs={gameRefs} tick={tick} />
```

- [x] **Step 11: Lint + tsc**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx eslint src/components/game/space-shooter.tsx && npx tsc --noEmit
```

Expected: clean.

- [x] **Step 12: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): coin entity drops from kills + magnet + collection"
```

---

### Task 4: Persist wallet additions on run end

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

**Why:** Coins earned in a run credit to the wallet on death. Also mark `firstRunCompleted` and bump run counters.

- [x] **Step 1: Import profile helpers**

At the top of `space-shooter.tsx`, add:

```ts
import { addCoins, addRunStats, incrementRunsPlayed, loadProfile, markFirstRunCompleted } from "./profile";
```

- [x] **Step 2: Credit coins + stats in `onDeath`**

In `onDeath`, after `const final = Math.floor(g.score);` add:

```ts
    // Persist everything that compounds across runs.
    addCoins(g.coinsThisRun);
    addRunStats({ asteroidsDestroyed: g.kills, distance: Math.floor(g.distance) });
    incrementRunsPlayed();
    markFirstRunCompleted();
```

- [x] **Step 3: Lint + tsc**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx eslint src/components/game/space-shooter.tsx && npx tsc --noEmit
```

- [x] **Step 4: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): persist coin earnings + run stats on death"
```

---

### Task 5: Apply upgrades at run start

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

**Why:** On `startRun`, read the player's upgrade levels from the profile and populate the per-run modifier fields (`coinMagnetExtra`, `scoreMultiplier`, etc.). This keeps per-frame logic clean — no upgrade lookup inside hot loops.

- [x] **Step 1: Import upgrade catalog**

At the top of `space-shooter.tsx`:

```ts
import { UPGRADES, upgradeById } from "./shop-data";
```

- [x] **Step 2: Populate modifiers in `startRun`**

In `startRun`, after `g.nextWallAt = now + 20_000;` add:

```ts
  // Apply purchased upgrades as per-run modifiers
  const profile = loadProfile();
  const getLevel = (id: string) => profile.ownedUpgrades[id] ?? 0;
  g.coinMagnetExtra = (upgradeById("coin-magnet")?.effectAtLevel(getLevel("coin-magnet")) ?? 1) - 1;
  g.coinValueBonus = (upgradeById("coin-value")?.effectAtLevel(getLevel("coin-value")) ?? 1) - 1;
  g.scoreMultiplier = upgradeById("score-multiplier")?.effectAtLevel(getLevel("score-multiplier")) ?? 1;
  g.comboWindowMs = (upgradeById("combo-window")?.effectAtLevel(getLevel("combo-window")) ?? 4) * 1000;
  g.shieldDurationMs = upgradeById("shield-duration")?.effectAtLevel(getLevel("shield-duration")) ?? 8000;
```

- [x] **Step 3: Use `comboWindowMs` for combo decay**

In `runTick`, find the combo decay from Plan 1:

```ts
  if (g.combo > 1 && now - g.comboLastAt > COMBO_WINDOW_MS) {
    g.combo = 1;
  }
```

Replace with:

```ts
  const comboWindow = g.comboWindowMs > 0 ? g.comboWindowMs : COMBO_WINDOW_MS;
  if (g.combo > 1 && now - g.comboLastAt > comboWindow) {
    g.combo = 1;
  }
```

- [x] **Step 4: Apply `coinValueBonus` in spawn**

In the asteroid-kill block, find the coin value calc from Task 3:

```ts
          const coinValue = 1 + Math.floor(g.combo / 5);
```

Replace with:

```ts
          const coinValue = Math.max(1, 1 + Math.floor(g.combo / 5) + g.coinValueBonus);
```

- [x] **Step 5: Apply `scoreMultiplier` at death time**

In `onDeath`, replace:

```ts
    const final = Math.floor(g.score);
```

With:

```ts
    const final = Math.floor(g.score * g.scoreMultiplier);
```

- [x] **Step 6: Use `shieldDurationMs` when activating shield power-up**

Find `activatePowerUp`:

```ts
function activatePowerUp(g: GameRefs, t: PowerUpType): void {
  const now = performance.now();
  const expiresAt = now + POWERUP_DURATION_MS;
  // ...
}
```

Replace with:

```ts
function activatePowerUp(g: GameRefs, t: PowerUpType): void {
  const now = performance.now();
  const duration = t === "shield" && g.shieldDurationMs > 0 ? g.shieldDurationMs : POWERUP_DURATION_MS;
  const expiresAt = now + duration;
  // ...
}
```

- [x] **Step 7: Lint + tsc**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx eslint src/components/game/space-shooter.tsx && npx tsc --noEmit
```

- [x] **Step 8: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): apply purchased upgrades at run start (coins/score/combo/shield)"
```

---

### Task 6: Shop modal UI (Upgrades tab only)

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

**Why:** Returning players need a UI to see their wallet and spend coins. Modal is rendered inside the canvas container so the game scene stays alive behind it.

- [x] **Step 1: Import icons + state**

Top of file, extend lucide imports:

```ts
import {
  Rocket, Trophy, Shield, RotateCcw, Send,
  Volume2, VolumeX, Crosshair, Zap, Target,
  Maximize2, Minimize2, Pause, Play,
  ShoppingCart, Magnet, Coins, Timer, X as XIcon,
} from "lucide-react";
```

- [x] **Step 2: Add shop-open state + helper**

Inside the `SpaceShooterGame` component, near the other useState calls:

```ts
  const [shopOpen, setShopOpen] = useState(false);
  const [profile, setProfile] = useState(() => loadProfile());
  const refreshProfile = useCallback(() => setProfile(loadProfile()), []);
```

- [x] **Step 3: Add `isReturningPlayer` computed**

```ts
  const isReturningPlayer = profile.firstRunCompleted;
```

- [x] **Step 4: Add purchase handler**

```ts
  const buyUpgrade = useCallback((id: string) => {
    const def = upgradeById(id as "coin-magnet" | "coin-value" | "score-multiplier" | "combo-window" | "shield-duration");
    if (!def) return;
    const currentLevel = profile.ownedUpgrades[id] ?? 0;
    if (currentLevel >= def.maxLevel) return;
    const cost = def.costAtLevel(currentLevel + 1);
    if (profile.walletCoins < cost) return;
    // Spend + set level in one atomic pair (both mutate localStorage then refresh React state)
    const spend = spendCoins(cost);
    if (!spend.ok) return;
    setUpgradeLevel(id, currentLevel + 1);
    sounds.play("chime");
    refreshProfile();
  }, [profile, refreshProfile]);
```

Add `spendCoins` + `setUpgradeLevel` to the top import:

```ts
import { addCoins, addRunStats, incrementRunsPlayed, loadProfile, markFirstRunCompleted, saveProfile, setUpgradeLevel, spendCoins } from "./profile";
```

- [x] **Step 5: Render shop modal**

Add to the canvas container's JSX, alongside other overlays:

```tsx
        {/* Shop modal — only reachable for returning players */}
        <AnimatePresence>
          {shopOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col bg-black/80 backdrop-blur-md p-4 overflow-y-auto z-10"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <ShoppingCart className="h-5 w-5 text-accent-amber" />
                  <h3 className="text-lg font-bold text-white">Shop</h3>
                  <div className="flex items-center gap-1.5 rounded-md bg-accent-amber/20 border border-accent-amber/40 px-2 py-1 text-sm font-mono text-accent-amber">
                    <Coins className="h-3.5 w-3.5" />
                    {profile.walletCoins}
                  </div>
                </div>
                <button
                  onClick={() => setShopOpen(false)}
                  className="rounded-lg bg-white/10 border border-white/20 p-1.5 text-white hover:bg-white/20 transition-colors"
                  aria-label="Close shop"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-3xl mx-auto w-full">
                {UPGRADES.map((u) => {
                  const level = profile.ownedUpgrades[u.id] ?? 0;
                  const maxed = level >= u.maxLevel;
                  const nextCost = maxed ? 0 : u.costAtLevel(level + 1);
                  const affordable = profile.walletCoins >= nextCost;
                  const Icon =
                    u.iconKey === "magnet" ? Magnet :
                    u.iconKey === "coins" ? Coins :
                    u.iconKey === "trophy" ? Trophy :
                    u.iconKey === "timer" ? Timer :
                    Shield;
                  return (
                    <button
                      key={u.id}
                      onClick={() => !maxed && affordable && buyUpgrade(u.id)}
                      disabled={maxed || !affordable}
                      className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
                        maxed
                          ? "border-accent-green/40 bg-accent-green/10"
                          : affordable
                          ? "border-accent-blue/50 bg-white/5 hover:bg-white/10"
                          : "border-white/10 bg-white/5 opacity-50"
                      }`}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <Icon className="h-4 w-4 text-accent-blue" />
                        <span className="font-semibold text-white flex-1">{u.label}</span>
                        <span className="text-xs font-mono text-white/60">
                          L{level}/{u.maxLevel}
                        </span>
                      </div>
                      <div className="text-xs text-white/70">{u.description}</div>
                      <div className="flex items-center gap-1.5 mt-1 text-xs font-mono">
                        {maxed ? (
                          <span className="text-accent-green">MAXED</span>
                        ) : (
                          <>
                            <Coins className="h-3 w-3 text-accent-amber" />
                            <span className={affordable ? "text-accent-amber" : "text-white/40"}>{nextCost}</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
```

- [x] **Step 6: Lint + tsc**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx eslint src/components/game/space-shooter.tsx && npx tsc --noEmit
```

- [x] **Step 7: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): shop modal with 5 upgrade tiles, purchase flow, wallet display"
```

---

### Task 7: Returning-player armed overlay (Play + Shop buttons)

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

**Why:** First-timers keep the current minimal "move to start" experience. Returning players see explicit Play and Shop buttons instead, with wallet indicator.

- [x] **Step 1: Replace the armed overlay with conditional content**

Find the existing armed-state overlay (starts with `{ui.status === "armed" && (`):

```tsx
        <AnimatePresence>
          {ui.status === "armed" && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-2"
            >
              {/* ... existing first-time pulsing pill ... */}
            </motion.div>
          )}
        </AnimatePresence>
```

Replace the entire block with a branching version:

```tsx
        <AnimatePresence>
          {ui.status === "armed" && !isReturningPlayer && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-2"
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1], opacity: [0.85, 1, 0.85] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                className="relative"
              >
                <motion.span
                  className="absolute inset-0 rounded-full bg-accent-blue/15 blur-xl"
                  animate={{ scale: [1, 1.4, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                />
                <div className="relative rounded-full border-2 border-accent-blue/60 bg-black/75 backdrop-blur-md px-7 py-3 text-base font-semibold text-white shadow-lg shadow-accent-blue/20">
                  {isTouch ? "Drag your finger to start" : "Move your mouse or press WASD to start"}
                </div>
              </motion.div>
              <div className="text-xs uppercase tracking-[0.25em] text-white/60">
                Cannons fire automatically
              </div>
            </motion.div>
          )}
          {ui.status === "armed" && isReturningPlayer && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-3"
            >
              <div className="flex items-center gap-1.5 rounded-md bg-accent-amber/15 border border-accent-amber/40 px-2.5 py-1 text-xs font-mono text-accent-amber">
                <Coins className="h-3.5 w-3.5" />
                {profile.walletCoins}
              </div>
              <div className="flex items-center gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    // Triggering startRun manually — re-use the input handler path by dispatching a movement to self.
                    const g = gameRefs.current;
                    if (g.status === "armed") startRun(g);
                  }}
                  className="rounded-xl bg-linear-to-br from-accent-blue to-accent-pink px-7 py-3 text-base font-bold uppercase tracking-wider text-white shadow-lg shadow-accent-blue/30"
                >
                  Play
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShopOpen(true)}
                  className="flex items-center gap-2 rounded-xl bg-accent-amber/20 border border-accent-amber/50 px-5 py-3 text-sm font-bold uppercase tracking-wider text-accent-amber"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Shop
                </motion.button>
              </div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">
                {isTouch ? "Or drag finger" : "Or move mouse / press WASD"}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
```

- [x] **Step 2: Also expose shop from death overlay (returning players)**

In the death overlay, add next to the existing Fly Again button:

```tsx
              <div className="flex items-center gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={launch}
                  className="inline-flex items-center gap-2 rounded-xl bg-linear-to-br from-accent-blue to-accent-pink px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg"
                >
                  <RotateCcw className="h-4 w-4" />
                  Fly again
                </motion.button>
                {isReturningPlayer && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShopOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent-amber/20 border border-accent-amber/50 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-accent-amber"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Shop
                  </motion.button>
                )}
              </div>
```

Replace the existing single-button group with the above.

- [x] **Step 3: Refresh profile state after death**

In `onDeath`, at the end (after `fetchLeaderboard().then(setLeaderboard);`):

```ts
    refreshProfile();
```

- [x] **Step 4: Lint + tsc**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx eslint src/components/game/space-shooter.tsx && npx tsc --noEmit
```

- [x] **Step 5: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): Play/Shop buttons for returning players (first-timer flow preserved)"
```

---

### Task 8: Show coins-earned line on death overlay

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

**Why:** After the first run, players need to see they earned coins — this is what hooks them into the loop. For returning players, show an explicit `+N coins` line with animation.

- [x] **Step 1: Extend UiState with `coinsThisRun`**

Add to UiState:

```ts
interface UiState {
  status: GameStatus;
  score: number;
  seconds: number;
  kills: number;
  distance: number;
  combo: number;
  comboPeak: number;
  coinsThisRun: number;
  active: { type: PowerUpType; remainingMs: number }[];
}
```

Add `coinsThisRun: 0` to all `setUi` initializers.

In `onUiSync`:

```ts
      coinsThisRun: g.coinsThisRun,
```

In `launch` reset:

```ts
    setUi({ status: "armed", score: 0, seconds: 0, kills: 0, distance: 0, combo: 1, comboPeak: 1, coinsThisRun: 0, active: [] });
```

- [x] **Step 2: Add coins line to death overlay**

In the death overlay, directly above the stats grid, add:

```tsx
                {ui.coinsThisRun > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="mt-2 flex items-center justify-center gap-1.5 text-accent-amber font-mono text-sm"
                  >
                    <Coins className="h-4 w-4" />
                    +{ui.coinsThisRun} coins
                  </motion.div>
                )}
```

- [x] **Step 3: Lint + tsc**

```bash
cd "c:/Users/amind/OneDrive/Desktop/Projects/PERSONAL/personal-portfolio" && npx eslint src/components/game/space-shooter.tsx && npx tsc --noEmit
```

- [x] **Step 4: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): death overlay shows +coins earned this run"
```

---

### Task 9: Verification — Chrome DevTools integrated flow test

**Files:**
- No file changes. Scripted verification against the running dev server.

- [x] **Step 1: Clear any existing profile, play a run, verify coins persist**

Evaluate in the page:

```js
async () => {
  localStorage.removeItem("orbital-dodge-profile");
  const canvas = document.querySelector('canvas');
  const r = canvas.getBoundingClientRect();
  // Start the game (first move counts as first input)
  canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
  // Play for 25s — move in a figure-eight so we collect coins
  const start = performance.now();
  while (performance.now() - start < 25_000) {
    const t = (performance.now() - start) / 1000;
    const x = r.left + r.width / 2 + Math.sin(t * 2) * 200;
    const y = r.top + r.height / 2 + Math.cos(t * 1.5) * 120;
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
    await new Promise((rr) => setTimeout(rr, 100));
  }
  // Wait for death + overlay
  await new Promise((rr) => setTimeout(rr, 5_000));
  const profile = JSON.parse(localStorage.getItem("orbital-dodge-profile") ?? "null");
  return {
    walletCoins: profile?.walletCoins ?? null,
    totalCoinsEarned: profile?.totalCoinsEarned ?? null,
    firstRunCompleted: profile?.firstRunCompleted ?? null,
    totalRunsPlayed: profile?.totalRunsPlayed ?? null,
  };
}
```

- [x] **Step 2: Interpret**

Result observed: `walletCoins: 511, totalCoinsEarned: 11, firstRunCompleted: true, totalRunsPlayed: 1` — PASSED.

Expected: `firstRunCompleted: true`, `totalRunsPlayed: 1`, `walletCoins > 500` (started at 500 + earned during run), `totalCoinsEarned > 0`.

If `walletCoins === 500` exactly, coins weren't being collected. Debug:
- Confirm `spawnCoin` fires on asteroid kill (add console.log temporarily)
- Confirm collection proximity check triggers

- [x] **Step 3: Shop purchase verification**

After the run dies, click the Shop button, buy "Coin Value" L1 (cost 100), then start a new run. Compare coin drops — with `coinValueBonus = 1`, each pickup should show `+2` instead of `+1`.

Evaluate:

```js
() => {
  // Simulate buying Coin Value L1 via direct helper call
  const profile = JSON.parse(localStorage.getItem("orbital-dodge-profile"));
  const before = profile.walletCoins;
  profile.ownedUpgrades["coin-value"] = 1;
  profile.walletCoins -= 100;
  localStorage.setItem("orbital-dodge-profile", JSON.stringify(profile));
  return { before, after: profile.walletCoins, level: profile.ownedUpgrades["coin-value"] };
}
```

Start a new run by reloading. Collect coins. Confirm `+2` popups instead of `+1`.

- [x] **Step 4: No commit — verification only**

---

### Task 10: Tune if verification flagged issues

**Files:**
- Modify: `src/components/game/space-shooter.tsx` only if needed

> Skipped — Task 9 verification PASSED. Coins dropped and collected, wallet persisted 500 → 511. No tuning required.

- [x] **Step 1: If coin drops feel too rare**

Drop coins from power-ups too (not just asteroids). In the power-up collect block, after existing activation, add:

```ts
        spawnCoin(g, p.x, p.y, p.z, 3);
```

- [x] **Step 2: If magnet radius feels ineffective at L0**

Bump the baseline pickup radius in the `Coins` movement block from `0.6` to `0.9`.

- [x] **Step 3: Commit any tuning**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "tune(orbital-dodge): coin drop rate / magnet baseline per playtest"
```

---

## Acceptance Criteria

- `src/components/game/profile.ts` exists, exports the full Profile schema + helpers, and is the ONLY file that writes the `orbital-dodge-profile` localStorage key.
- `src/components/game/shop-data.ts` exists with 5 upgrades (`coin-magnet`, `coin-value`, `score-multiplier`, `combo-window`, `shield-duration`), each with 5 levels and the `stdCost` curve.
- Coins drop visibly from every asteroid kill. Value scales with combo and with the `coin-value` upgrade.
- Coins are pulled to the ship within the magnet radius and collected on proximity. Radius scales with `coin-magnet` upgrade.
- Wallet persists across sessions in `localStorage` key `orbital-dodge-profile`.
- New visitor sees the current "Move your mouse or press WASD to start" pill — no shop UI at all.
- After first death: `firstRunCompleted` flips to `true`, subsequent armed-state shows Play + Shop buttons with wallet counter.
- Shop modal renders, lets you spend coins on an upgrade, saves the new level, closes, and the upgrade applies on the NEXT run start (not mid-run).
- Score multiplier upgrade actually multiplies final score at death.
- Shield duration upgrade extends the shield power-up's active time.
- Combo window upgrade extends combo decay time.
- Lint and TypeScript pass clean after every task.
- Verification script confirms: after a 25s run with no prior profile, `walletCoins > 500` and `firstRunCompleted === true`.
