# Super Voltorb Flip — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Super Voltorb Flip as the 5th playable game in the portfolio — a faithful HGSS Voltorb Flip recreation with 3 Super-mode abilities (Shield, Voltorb Reveal, Cash Out), softer level drops, auto-memo, speed mode, stats dashboard, 3 themes, day/night cycle, weather rolls, level-tier music, and synthesized retro stingers.

**Architecture:** Single main React client component (`super-voltorb-flip.tsx`) with colocated pure-logic modules under `super-voltorb-flip/`. Sprite assets from samualtnorman open-source repo (GPL-3.0). Music via CC0 chiptune loops. Stingers generated at runtime via Web Audio API. LocalStorage for save/stats. Existing `/api/leaderboard` for scores.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, framer-motion, Web Audio API, vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-04-15-super-voltorb-flip-design.md`

---

## Pre-flight

**IMPORTANT:** Before writing any Next.js-specific code, read `node_modules/next/dist/docs/` for the relevant guide — this project's Next.js has breaking changes from what you may expect.

Run tests with: `npm test` (single run) or `npm run test:watch` (watch mode).

Test files use `*.test.ts` pattern, colocated with source or in `__tests__/`. Import helpers from `@testing-library/react`. Vitest config is inferred; confirm with `ls vitest.config.*` if tests don't run.

---

## Task 1: Set up directory structure and shared types

**Files:**
- Create: `src/components/game/super-voltorb-flip/types.ts`
- Create: `public/games/super-voltorb-flip/.gitkeep`

- [ ] **Step 1: Create directories**

```bash
mkdir -p src/components/game/super-voltorb-flip
mkdir -p src/components/game/super-voltorb-flip/__tests__
mkdir -p public/games/super-voltorb-flip/sprites/tile
mkdir -p public/games/super-voltorb-flip/sprites/button/memo
mkdir -p public/games/super-voltorb-flip/sprites/button/blue
mkdir -p public/games/super-voltorb-flip/sprites/number
mkdir -p public/games/super-voltorb-flip/sprites/frame
mkdir -p public/games/super-voltorb-flip/sprites/dialogue
mkdir -p public/games/super-voltorb-flip/sprites/memo
mkdir -p public/games/super-voltorb-flip/music
touch public/games/super-voltorb-flip/.gitkeep
```

- [ ] **Step 2: Create `types.ts`**

```ts
// src/components/game/super-voltorb-flip/types.ts

export type TileValue = 0 | 1 | 2 | 3;

export type MemoMarks = readonly [boolean, boolean, boolean, boolean];
// [voltorb?, one?, two?, three?]

export type Tile = {
  value: TileValue;
  flipped: boolean;
  animFrame: number | null;
  memos: MemoMarks;
};

export type LineHint = { points: number; voltorbs: number };

export type GameMode = "classic" | "super";

export type GamePhase =
  | "mode-select"
  | "loading"
  | "ready"
  | "playing"
  | "memo"
  | "revealing"
  | "won"
  | "lost"
  | "transition";

export type ThemeId = "classic" | "meadow" | "twilight";

export type WeatherKind =
  | "clear"
  | "sunny"
  | "rainy"
  | "snow"
  | "sandstorm"
  | "fog";

export type TimeOfDay = "morning" | "day" | "evening" | "night";

export type Stats = {
  gamesPlayed: number;
  wins: number;
  losses: number;
  bestStreak: number;
  currentStreak: number;
  highestSingleRoundCoins: number;
  highestLevelCleared: number;
  lifetimeCoins: number;
};

export type PersistedSave = {
  mode: GameMode | null;
  totalCoins: number;
  unlockedThemes: ThemeId[];
  activeTheme: ThemeId;
  autoMemoEnabled: boolean;
  speedMode: boolean;
  musicVolume: number;
  sfxVolume: number;
  stats: Stats;
};

export type GameState = {
  mode: GameMode;
  phase: GamePhase;
  level: number;
  board: Tile[][];
  rowHints: LineHint[];
  colHints: LineHint[];
  currentCoins: number;
  totalCoins: number;
  maxCoins: number;
  activeTheme: ThemeId;
  unlockedThemes: Set<ThemeId>;
  autoMemoEnabled: boolean;
  speedMode: boolean;
  weather: WeatherKind;
  timeOfDay: TimeOfDay;
  shieldArmed: boolean;
  shieldedLoss: boolean;
  voltorbRevealsUsed: number;
  successfulFlipsThisRound: number;
  requiredFlipsThisRound: number;  // twos + threes on the board (for softer drop)
  selectedMemoTile: { row: number; col: number } | null;
  memoCopyMode: boolean;
  stats: Stats;
};

export const EMPTY_MEMOS: MemoMarks = [false, false, false, false];

export const INITIAL_STATS: Stats = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  bestStreak: 0,
  currentStreak: 0,
  highestSingleRoundCoins: 0,
  highestLevelCleared: 0,
  lifetimeCoins: 0,
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors in `super-voltorb-flip/types.ts`

- [ ] **Step 4: Commit**

```bash
git add src/components/game/super-voltorb-flip/types.ts public/games/super-voltorb-flip/.gitkeep
git commit -m "feat(voltorb-flip): add shared types and directory structure"
```

---

## Task 2: Level configuration data

**Files:**
- Create: `src/components/game/super-voltorb-flip/levels.ts`
- Create: `src/components/game/super-voltorb-flip/__tests__/levels.test.ts`

The 8×5 level config table matches the original HGSS mechanics. Each config is `[twos, threes, voltorbs, maxCoins]`. `maxCoins = 2^twos × 3^threes`.

- [ ] **Step 1: Write failing test**

```ts
// src/components/game/super-voltorb-flip/__tests__/levels.test.ts
import { describe, it, expect } from "vitest";
import { LEVELS } from "../levels";

describe("LEVELS table", () => {
  it("has 8 levels", () => {
    expect(LEVELS).toHaveLength(8);
  });

  it("each level has 5 configs", () => {
    for (const level of LEVELS) {
      expect(level).toHaveLength(5);
    }
  });

  it("each config has 4 numbers", () => {
    for (const level of LEVELS) {
      for (const config of level) {
        expect(config).toHaveLength(4);
      }
    }
  });

  it("maxCoins equals 2^twos * 3^threes for every config", () => {
    for (const level of LEVELS) {
      for (const [twos, threes, , maxCoins] of level) {
        expect(maxCoins).toBe(Math.pow(2, twos) * Math.pow(3, threes));
      }
    }
  });

  it("total special tile count is <= 25 (fits in 5x5 grid)", () => {
    for (const level of LEVELS) {
      for (const [twos, threes, voltorbs] of level) {
        expect(twos + threes + voltorbs).toBeLessThanOrEqual(25);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- levels.test`
Expected: FAIL — "Cannot find module '../levels'"

- [ ] **Step 3: Create levels.ts**

```ts
// src/components/game/super-voltorb-flip/levels.ts

export type LevelConfig = readonly [
  twos: number,
  threes: number,
  voltorbs: number,
  maxCoins: number,
];

/**
 * Level configurations from the original HGSS game.
 * Each level has 5 possible board configurations, randomly selected per round.
 * Format: [twos, threes, voltorbs, maxCoins]
 * maxCoins = 2^twos * 3^threes
 */
export const LEVELS: readonly (readonly LevelConfig[])[] = [
  // Level 1
  [
    [3, 1, 6, 24],
    [0, 3, 6, 27],
    [5, 0, 6, 32],
    [2, 2, 6, 36],
    [4, 1, 6, 48],
  ],
  // Level 2
  [
    [1, 3, 7, 54],
    [6, 0, 7, 64],
    [3, 2, 7, 72],
    [0, 4, 7, 81],
    [5, 1, 7, 96],
  ],
  // Level 3
  [
    [2, 3, 8, 108],
    [7, 0, 8, 128],
    [4, 2, 8, 144],
    [1, 4, 8, 162],
    [6, 1, 8, 192],
  ],
  // Level 4
  [
    [3, 3, 8, 216],
    [0, 5, 8, 243],
    [8, 0, 10, 256],
    [5, 2, 10, 288],
    [2, 4, 10, 324],
  ],
  // Level 5
  [
    [7, 1, 10, 384],
    [4, 3, 10, 432],
    [1, 5, 10, 486],
    [9, 0, 10, 512],
    [6, 2, 10, 576],
  ],
  // Level 6
  [
    [3, 4, 10, 648],
    [0, 6, 10, 729],
    [8, 1, 10, 768],
    [5, 3, 10, 864],
    [2, 5, 10, 972],
  ],
  // Level 7
  [
    [7, 2, 10, 1152],
    [4, 4, 10, 1296],
    [1, 6, 13, 1458],
    [9, 1, 13, 1536],
    [6, 3, 10, 1728],
  ],
  // Level 8
  [
    [0, 7, 10, 2187],
    [8, 2, 10, 2304],
    [5, 4, 10, 2592],
    [2, 6, 10, 2916],
    [7, 3, 10, 3456],
  ],
] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- levels.test`
Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/components/game/super-voltorb-flip/levels.ts src/components/game/super-voltorb-flip/__tests__/levels.test.ts
git commit -m "feat(voltorb-flip): add level configuration table with tests"
```

---

## Task 3: Board generation

**Files:**
- Create: `src/components/game/super-voltorb-flip/board.ts`
- Create: `src/components/game/super-voltorb-flip/__tests__/board.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/components/game/super-voltorb-flip/__tests__/board.test.ts
import { describe, it, expect } from "vitest";
import { generateBoard, computeHints } from "../board";
import { LEVELS } from "../levels";

describe("generateBoard", () => {
  it("produces a 5x5 grid", () => {
    const { board } = generateBoard(1);
    expect(board).toHaveLength(5);
    expect(board[0]).toHaveLength(5);
  });

  it("every tile starts unflipped with empty memos", () => {
    const { board } = generateBoard(1);
    for (const row of board) {
      for (const tile of row) {
        expect(tile.flipped).toBe(false);
        expect(tile.animFrame).toBeNull();
        expect(tile.memos).toEqual([false, false, false, false]);
      }
    }
  });

  it("tile values match the config counts", () => {
    // Deterministic seed for test
    const { board, maxCoins } = generateBoard(1, () => 0);
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const row of board) {
      for (const tile of row) {
        counts[tile.value]++;
      }
    }
    // With seed 0, always picks config index 0 at level 1: [3, 1, 6, 24]
    // That's 3 twos, 1 three, 6 voltorbs, rest ones
    const [twos, threes, voltorbs] = LEVELS[0][0];
    expect(counts[2]).toBe(twos);
    expect(counts[3]).toBe(threes);
    expect(counts[0]).toBe(voltorbs);
    expect(counts[1]).toBe(25 - twos - threes - voltorbs);
    expect(maxCoins).toBe(24);
  });

  it("generates different boards on repeated calls (randomness)", () => {
    const a = JSON.stringify(generateBoard(3).board.map((r) => r.map((t) => t.value)));
    const b = JSON.stringify(generateBoard(3).board.map((r) => r.map((t) => t.value)));
    // Not guaranteed unique but extremely likely
    expect(a === b).toBe(false);
  });
});

describe("computeHints", () => {
  it("returns 5 row hints and 5 column hints", () => {
    const { board } = generateBoard(1);
    const { rowHints, colHints } = computeHints(board);
    expect(rowHints).toHaveLength(5);
    expect(colHints).toHaveLength(5);
  });

  it("row hint sums match tile values in that row", () => {
    const { board } = generateBoard(1);
    const { rowHints } = computeHints(board);
    for (let r = 0; r < 5; r++) {
      let points = 0;
      let voltorbs = 0;
      for (let c = 0; c < 5; c++) {
        const v = board[r][c].value;
        if (v === 0) voltorbs++;
        else points += v;
      }
      expect(rowHints[r].points).toBe(points);
      expect(rowHints[r].voltorbs).toBe(voltorbs);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- board.test`
Expected: FAIL — "Cannot find module '../board'"

- [ ] **Step 3: Create `board.ts`**

```ts
// src/components/game/super-voltorb-flip/board.ts
import { LEVELS } from "./levels";
import { EMPTY_MEMOS, type Tile, type LineHint, type TileValue } from "./types";

export type GeneratedBoard = {
  board: Tile[][];
  maxCoins: number;
  twos: number;
  threes: number;
  voltorbs: number;
};

/**
 * Generate a new 5x5 Voltorb Flip board for the given level (1-8).
 * @param level 1-indexed level number
 * @param rng optional RNG function returning [0, 1); defaults to Math.random
 */
export function generateBoard(level: number, rng: () => number = Math.random): GeneratedBoard {
  const levelIdx = Math.max(0, Math.min(7, level - 1));
  const configs = LEVELS[levelIdx];
  const configIdx = Math.floor(rng() * configs.length) % configs.length;
  const [twos, threes, voltorbs, maxCoins] = configs[configIdx];

  // Start all 25 tiles with value 1
  const values: TileValue[] = Array.from({ length: 25 }, () => 1 as TileValue);

  // Pool of tile indices still available for special placement
  const pool = Array.from({ length: 25 }, (_, i) => i);

  const placeCount = (value: TileValue, count: number) => {
    for (let i = 0; i < count; i++) {
      const pickIdx = Math.floor(rng() * pool.length) % pool.length;
      const tileIdx = pool.splice(pickIdx, 1)[0];
      values[tileIdx] = value;
    }
  };

  placeCount(2, twos);
  placeCount(3, threes);
  placeCount(0, voltorbs);

  const board: Tile[][] = Array.from({ length: 5 }, (_, r) =>
    Array.from({ length: 5 }, (_, c) => ({
      value: values[r * 5 + c],
      flipped: false,
      animFrame: null,
      memos: EMPTY_MEMOS,
    })),
  );

  return { board, maxCoins, twos, threes, voltorbs };
}

/**
 * Compute row and column hints (point sum + voltorb count) for a board.
 */
export function computeHints(board: Tile[][]): { rowHints: LineHint[]; colHints: LineHint[] } {
  const rowHints: LineHint[] = Array.from({ length: 5 }, () => ({ points: 0, voltorbs: 0 }));
  const colHints: LineHint[] = Array.from({ length: 5 }, () => ({ points: 0, voltorbs: 0 }));

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const v = board[r][c].value;
      if (v === 0) {
        rowHints[r].voltorbs++;
        colHints[c].voltorbs++;
      } else {
        rowHints[r].points += v;
        colHints[c].points += v;
      }
    }
  }

  return { rowHints, colHints };
}

/**
 * Apply the Super Mode softer level drop based on successful flips.
 * @param currentLevel current level (1-8)
 * @param requiredFlips number of 2s + 3s on the board (goal)
 * @param successfulFlips non-Voltorb tiles flipped this round
 * @returns new level (minimum 1)
 */
export function applyDrop(
  currentLevel: number,
  requiredFlips: number,
  successfulFlips: number,
): number {
  const drop = Math.max(0, Math.ceil((requiredFlips - successfulFlips) / 2));
  return Math.max(1, currentLevel - drop);
}
```

- [ ] **Step 4: Extend test file to cover `applyDrop`**

Append to `__tests__/board.test.ts`:

```ts
import { applyDrop } from "../board";

describe("applyDrop (softer level drop)", () => {
  it("no drop when all required tiles flipped", () => {
    expect(applyDrop(5, 4, 4)).toBe(5);
    expect(applyDrop(5, 4, 10)).toBe(5);
  });

  it("drops proportional to missing flips", () => {
    expect(applyDrop(5, 6, 0)).toBe(2); // drop = ceil(6/2) = 3
    expect(applyDrop(5, 6, 2)).toBe(3); // drop = ceil(4/2) = 2
    expect(applyDrop(5, 6, 4)).toBe(4); // drop = ceil(2/2) = 1
  });

  it("never drops below 1", () => {
    expect(applyDrop(1, 8, 0)).toBe(1);
    expect(applyDrop(2, 20, 0)).toBe(1);
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- board.test`
Expected: PASS — all board tests passing

- [ ] **Step 6: Commit**

```bash
git add src/components/game/super-voltorb-flip/board.ts src/components/game/super-voltorb-flip/__tests__/board.test.ts
git commit -m "feat(voltorb-flip): add board generation, hints, and softer drop logic"
```

---

## Task 4: Auto-memo deduction engine

**Files:**
- Create: `src/components/game/super-voltorb-flip/auto-memo.ts`
- Create: `src/components/game/super-voltorb-flip/__tests__/auto-memo.test.ts`

The deduction engine looks at row/column hints and flipped tiles, and returns updated memo marks for unflipped tiles.

- [ ] **Step 1: Write failing test**

```ts
// src/components/game/super-voltorb-flip/__tests__/auto-memo.test.ts
import { describe, it, expect } from "vitest";
import { deduceAll } from "../auto-memo";
import { computeHints } from "../board";
import type { Tile, TileValue } from "../types";

function makeBoard(values: TileValue[][]): Tile[][] {
  return values.map((row) =>
    row.map((value) => ({
      value,
      flipped: false,
      animFrame: null,
      memos: [false, false, false, false] as const,
    })),
  );
}

describe("deduceAll", () => {
  it("marks all tiles in a zero-voltorb row as 'not voltorb'", () => {
    // Row 0 has no voltorbs (all 1s)
    const board = makeBoard([
      [1, 1, 1, 1, 1],
      [0, 2, 1, 1, 3],
      [1, 1, 0, 1, 1],
      [1, 3, 1, 2, 0],
      [2, 1, 1, 1, 1],
    ]);
    const { rowHints, colHints } = computeHints(board);
    const memos = deduceAll(board, rowHints, colHints);
    // Every tile in row 0 should have memos[0] (voltorb?) == false-locked
    // We represent "ruled out voltorb" with memos[0] = false staying false but we also
    // mark positive knowledge. Our convention: memos track "I think it MIGHT be X".
    // A fully-safe row → we set memos 1,2,3 to true (all three are possible) and leave voltorb=false.
    // This concrete assertion checks the row-0 tiles are NOT marked as possibly-voltorb
    // (they stay memos[0]=false) AND memos[1|2|3] are not forced off.
    for (let c = 0; c < 5; c++) {
      expect(memos[0][c][0]).toBe(false); // voltorb ruled out
    }
  });

  it("marks all-ones row (points == 5, voltorbs == 0) as all ones", () => {
    const board = makeBoard([
      [1, 1, 1, 1, 1],
      [0, 2, 1, 1, 3],
      [1, 1, 0, 1, 1],
      [1, 3, 1, 2, 0],
      [2, 1, 1, 1, 1],
    ]);
    const { rowHints, colHints } = computeHints(board);
    expect(rowHints[0].points).toBe(5);
    expect(rowHints[0].voltorbs).toBe(0);
    const memos = deduceAll(board, rowHints, colHints);
    // Every tile in row 0 should have memos[1] (one?) == true — positively known as 1
    for (let c = 0; c < 5; c++) {
      expect(memos[0][c][1]).toBe(true);
      expect(memos[0][c][2]).toBe(false);
      expect(memos[0][c][3]).toBe(false);
      expect(memos[0][c][0]).toBe(false);
    }
  });

  it("preserves existing flipped tiles (no memo updates for them)", () => {
    const board = makeBoard([
      [1, 1, 1, 1, 1],
      [0, 2, 1, 1, 3],
      [1, 1, 0, 1, 1],
      [1, 3, 1, 2, 0],
      [2, 1, 1, 1, 1],
    ]);
    board[0][0].flipped = true;
    const { rowHints, colHints } = computeHints(board);
    const memos = deduceAll(board, rowHints, colHints);
    // Flipped tile has no memos (they don't matter)
    expect(memos[0][0]).toEqual([false, false, false, false]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auto-memo.test`
Expected: FAIL — "Cannot find module '../auto-memo'"

- [ ] **Step 3: Create `auto-memo.ts`**

```ts
// src/components/game/super-voltorb-flip/auto-memo.ts
import { EMPTY_MEMOS, type Tile, type LineHint, type MemoMarks } from "./types";

/**
 * Smart Auto-Memo engine.
 * Given the board state + hints, returns a 5x5 grid of memo marks inferred
 * via simple logical deduction on each row and column.
 *
 * Memo index: [voltorb?, one?, two?, three?]
 * Convention: `true` means "this value is possible for this tile".
 * A flipped tile gets all-false memos (irrelevant).
 *
 * Deductions handled (baseline cases):
 *  1. Line with 0 voltorbs → no tile in it is a voltorb (memos[0] stays false).
 *  2. Line with all-ones (points equals unflipped tile count, 0 voltorbs) → memos[1] = true, others false.
 *  3. Line where unflipped count == voltorbs + (points === unflipped count - voltorbs) → similar forced deductions.
 */
export function deduceAll(
  board: Tile[][],
  rowHints: LineHint[],
  colHints: LineHint[],
): MemoMarks[][] {
  // Initialize all memos as "all possibilities open" for unflipped tiles,
  // all-false for flipped tiles.
  const memos: boolean[][][] = board.map((row) =>
    row.map((t) =>
      t.flipped
        ? [false, false, false, false]
        : [true, true, true, true],
    ),
  );

  const applyLine = (
    hint: LineHint,
    getTile: (i: number) => { tile: Tile; r: number; c: number },
  ) => {
    let unflipped = 0;
    let knownPoints = 0;
    let knownVoltorbs = 0;
    for (let i = 0; i < 5; i++) {
      const { tile } = getTile(i);
      if (!tile.flipped) {
        unflipped++;
      } else {
        if (tile.value === 0) knownVoltorbs++;
        else knownPoints += tile.value;
      }
    }
    const remainingPoints = hint.points - knownPoints;
    const remainingVoltorbs = hint.voltorbs - knownVoltorbs;

    // Case 1: no voltorbs remaining in this line → rule out voltorb for every unflipped tile.
    if (remainingVoltorbs === 0) {
      for (let i = 0; i < 5; i++) {
        const { tile, r, c } = getTile(i);
        if (!tile.flipped) memos[r][c][0] = false;
      }
    }

    // Case 2: all remaining unflipped must be voltorbs
    if (remainingVoltorbs === unflipped) {
      for (let i = 0; i < 5; i++) {
        const { tile, r, c } = getTile(i);
        if (!tile.flipped) {
          memos[r][c][0] = true;
          memos[r][c][1] = false;
          memos[r][c][2] = false;
          memos[r][c][3] = false;
        }
      }
    }

    // Case 3: line is fully determined as all-ones (points == unflipped - voltorbs)
    // The non-voltorb unflipped tiles must all be value 1.
    const unflippedNonVoltorbs = unflipped - remainingVoltorbs;
    if (unflippedNonVoltorbs > 0 && remainingPoints === unflippedNonVoltorbs) {
      for (let i = 0; i < 5; i++) {
        const { tile, r, c } = getTile(i);
        if (tile.flipped) continue;
        if (memos[r][c][0]) continue; // might be a voltorb — skip
        memos[r][c][1] = true;
        memos[r][c][2] = false;
        memos[r][c][3] = false;
      }
    }
  };

  for (let r = 0; r < 5; r++) {
    applyLine(rowHints[r], (i) => ({ tile: board[r][i], r, c: i }));
  }
  for (let c = 0; c < 5; c++) {
    applyLine(colHints[c], (i) => ({ tile: board[i][c], r: i, c }));
  }

  return memos.map((row) =>
    row.map((m) => [m[0], m[1], m[2], m[3]] as MemoMarks),
  );
}

export { EMPTY_MEMOS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- auto-memo.test`
Expected: PASS — all auto-memo tests passing

- [ ] **Step 5: Commit**

```bash
git add src/components/game/super-voltorb-flip/auto-memo.ts src/components/game/super-voltorb-flip/__tests__/auto-memo.test.ts
git commit -m "feat(voltorb-flip): add smart auto-memo deduction engine"
```

---

## Task 5: Fetch sprite assets from upstream repo

**Files:**
- Create: `scripts/fetch-voltorb-assets.mjs`
- Create: `public/games/super-voltorb-flip/sprites/LICENSE`
- Create: `public/games/super-voltorb-flip/sprites/NOTICE.md`

The samualtnorman/voltorb-flip repo is GPL-3.0. We include its LICENSE + a NOTICE crediting the source. GPL-3.0 aggregation clause means the sprites' license does NOT force the portfolio code to be GPL — but we must preserve the LICENSE with the sprites.

- [ ] **Step 1: Create fetch script**

```js
// scripts/fetch-voltorb-assets.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const BASE = "https://raw.githubusercontent.com/samualtnorman/voltorb-flip/main/src/assets";
const OUT = "public/games/super-voltorb-flip/sprites";

const FILES = [
  // tiles
  "tile/blank.png", "tile/hover.png",
  "tile/flip_0.png", "tile/flip_1.png",
  "tile/1.png", "tile/2.png", "tile/3.png",
  "tile/1_flip.png", "tile/2_flip.png", "tile/3_flip.png",
  "tile/voltorb.png", "tile/voltorb_flip.png",
  "tile/memo_0.png", "tile/memo_1.png", "tile/memo_2.png", "tile/memo_3.png",
  ...Array.from({ length: 9 }, (_, i) => `tile/explode_${i}.png`),
  // buttons
  "button/play.png", "button/quit.png", "button/game_info.png",
  "button/blue/quit.png", "button/blue/quit_hover.png", "button/blue/quit_press.png",
  "button/memo/0_off.png", "button/memo/0_on.png",
  "button/memo/1_off.png", "button/memo/1_on.png",
  "button/memo/2_off.png", "button/memo/2_on.png",
  "button/memo/3_off.png", "button/memo/3_on.png",
  "button/memo/open.png", "button/memo/open_press.png",
  "button/memo/close.png", "button/memo/close_press.png",
  "button/memo/hover.png", "button/memo/s_off.png", "button/memo/s_on.png",
  // numbers
  ...Array.from({ length: 10 }, (_, i) => `number/big_${i}.png`),
  ...Array.from({ length: 10 }, (_, i) => `number/bold_${i}.png`),
  ...Array.from({ length: 8 }, (_, i) => `number/thin_${i + 1}.png`),
  // frame
  "frame/frame.png", "frame/hover_0.png", "frame/hover_1.png", "frame/hover_2.png",
  // dialogue
  "dialogue/play.png",
  "dialogue/clear_0.png", "dialogue/clear_1.png", "dialogue/clear_2.png",
  "dialogue/received.png",
  "dialogue/received_0.png", "dialogue/received_1.png", "dialogue/received_2.png", "dialogue/received_3.png",
  // memo panel
  "memo/0.png", "memo/1.png", "memo/2.png", "memo/3.png",
  "memo/frame.png", "memo/hover.png", "memo/press.png",
  // misc
  "background.png",
  "success_0.png", "success_1.png", "success_2.png", "success_3.png",
];

async function fetchOne(rel) {
  const url = `${BASE}/${rel}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = join(OUT, rel);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  process.stdout.write(`  ${rel} (${buf.length}B)\n`);
}

console.log(`Fetching ${FILES.length} sprites to ${OUT}...`);
for (const f of FILES) {
  try { await fetchOne(f); } catch (err) { console.error(`FAILED ${f}: ${err.message}`); }
}

// Fetch the LICENSE file
const licRes = await fetch("https://raw.githubusercontent.com/samualtnorman/voltorb-flip/main/LICENSE");
const licText = await licRes.text();
await writeFile(join(OUT, "LICENSE"), licText);
console.log("Done.");
```

- [ ] **Step 2: Run the fetch script**

```bash
node scripts/fetch-voltorb-assets.mjs
```

Expected: ~70 PNG files + LICENSE written under `public/games/super-voltorb-flip/sprites/`.

- [ ] **Step 3: Create `NOTICE.md`**

```markdown
# Sprite Assets

The pixel sprites in this directory are sourced from the open-source project
[samualtnorman/voltorb-flip](https://github.com/samualtnorman/voltorb-flip)
(a faithful recreation of Voltorb Flip from Pokemon HeartGold/SoulSilver).

**License:** GPL-3.0-or-later (see `LICENSE` in this directory).

The sprites are included as aggregate assets under the GPL-3.0 aggregation clause.
The surrounding portfolio code remains under its own license.

Fan-made recreations of Pokemon assets are used non-commercially for portfolio
demonstration purposes. All intellectual property in the underlying Pokemon
franchise belongs to Nintendo, Game Freak, and Creatures Inc.
```

- [ ] **Step 4: Verify asset count**

```bash
find public/games/super-voltorb-flip/sprites -type f -name "*.png" | wc -l
```
Expected: 70+ PNG files.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-voltorb-assets.mjs public/games/super-voltorb-flip/sprites
git commit -m "feat(voltorb-flip): add sprite assets from samualtnorman/voltorb-flip (GPL-3.0)"
```

---

## Task 6: Curate CC0 music tracks

**Files:**
- Create: `public/games/super-voltorb-flip/music/CREDITS.md`
- Place: 6 CC0 chiptune loops in `public/games/super-voltorb-flip/music/`

- [ ] **Step 1: Pick and download 6 tracks**

Required tracks (all CC0 or CC-BY from OpenGameArt.org or Pixabay Music):
- `rookie.mp3` — upbeat cheerful chiptune, ~120 BPM, 30-60s loop
- `veteran.mp3` — moderate tempo with percussion, ~140 BPM
- `master.mp3` — intense driving chiptune, ~160 BPM
- `theme-classic.mp3` — casino/arcade chiptune for idle menu state
- `theme-meadow.mp3` — pastoral/flute-led chiptune
- `theme-twilight.mp3` — warm mellow evening loop

Suggested sourcing: search OpenGameArt.org for "chiptune loop" + filter CC0. Save as MP3, ~64kbps mono to keep file sizes small.

Place them in `public/games/super-voltorb-flip/music/` with those exact filenames.

- [ ] **Step 2: Create `CREDITS.md`**

```markdown
# Music Credits

All tracks in this directory are licensed CC0 (public domain) or CC-BY.
No Nintendo copyrighted music ships in this portfolio.

| File | Title | Author | License | Source |
|---|---|---|---|---|
| `rookie.mp3` | TBD-fill-in | TBD | CC0 | URL |
| `veteran.mp3` | TBD | TBD | CC0 | URL |
| `master.mp3` | TBD | TBD | CC0 | URL |
| `theme-classic.mp3` | TBD | TBD | CC0 | URL |
| `theme-meadow.mp3` | TBD | TBD | CC0 | URL |
| `theme-twilight.mp3` | TBD | TBD | CC0 | URL |

Replace each TBD row with the actual track title, author handle, license type, and source URL.
```

- [ ] **Step 3: Commit**

```bash
git add public/games/super-voltorb-flip/music
git commit -m "feat(voltorb-flip): add CC0 chiptune music tracks with credits"
```

---

## Task 7: Web Audio API synthesized stingers

**Files:**
- Create: `src/components/game/super-voltorb-flip/audio.ts`
- Create: `src/components/game/super-voltorb-flip/__tests__/audio.test.ts`

Stingers are short musical phrases generated in code via Web Audio API oscillators — no files needed.

- [ ] **Step 1: Write minimal smoke test**

```ts
// src/components/game/super-voltorb-flip/__tests__/audio.test.ts
import { describe, it, expect, vi } from "vitest";
import { STINGERS, synthStinger } from "../audio";

describe("STINGERS table", () => {
  it("defines all required stinger kinds", () => {
    expect(STINGERS).toHaveProperty("win");
    expect(STINGERS).toHaveProperty("lose");
    expect(STINGERS).toHaveProperty("levelUp");
    expect(STINGERS).toHaveProperty("tileFlip");
    expect(STINGERS).toHaveProperty("explosion");
    expect(STINGERS).toHaveProperty("coinTick");
    expect(STINGERS).toHaveProperty("shieldAbsorb");
    expect(STINGERS).toHaveProperty("voltorbReveal");
  });

  it("every stinger has at least one note", () => {
    for (const [, notes] of Object.entries(STINGERS)) {
      expect(notes.length).toBeGreaterThan(0);
    }
  });
});

describe("synthStinger", () => {
  it("schedules oscillators and returns a promise", () => {
    const mockNow = 0;
    const scheduled: Array<{ freq: number; start: number; end: number }> = [];
    const ctx = {
      currentTime: mockNow,
      destination: {},
      createOscillator: () => {
        const o = { frequency: { setValueAtTime: vi.fn() }, type: "sine",
          connect: vi.fn(), start: vi.fn((t: number) => scheduled.push({ freq: 0, start: t, end: 0 })),
          stop: vi.fn((t: number) => { const last = scheduled[scheduled.length - 1]; if (last) last.end = t; }) };
        return o;
      },
      createGain: () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn() }),
    } as unknown as AudioContext;

    synthStinger(ctx, "win");
    expect(scheduled.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test (will fail with missing module)**

Run: `npm test -- audio.test`
Expected: FAIL — "Cannot find module '../audio'"

- [ ] **Step 3: Create `audio.ts`**

```ts
// src/components/game/super-voltorb-flip/audio.ts

export type Note = {
  freq: number;        // Hz, 0 for rest
  duration: number;    // seconds
  type?: OscillatorType;
  volume?: number;     // 0-1, default 0.25
  detune?: number;     // cents
};

export type StingerKind =
  | "win"
  | "lose"
  | "levelUp"
  | "tileFlip"
  | "explosion"
  | "coinTick"
  | "shieldAbsorb"
  | "voltorbReveal"
  | "streakMilestone"
  | "checkpoint";

/**
 * Short original musical phrases generated via Web Audio oscillators.
 * Frequencies follow equal-tempered tuning. Durations tuned for retro feel.
 */
export const STINGERS: Record<StingerKind, Note[]> = {
  // Ascending major arpeggio: C5 E5 G5 C6
  win: [
    { freq: 523.25, duration: 0.10, type: "square", volume: 0.22 },
    { freq: 659.25, duration: 0.10, type: "square", volume: 0.22 },
    { freq: 783.99, duration: 0.10, type: "square", volume: 0.22 },
    { freq: 1046.5, duration: 0.28, type: "square", volume: 0.26 },
  ],
  // Descending minor: G4 Eb4 C4
  lose: [
    { freq: 392.0,  duration: 0.18, type: "sawtooth", volume: 0.22 },
    { freq: 311.13, duration: 0.18, type: "sawtooth", volume: 0.20 },
    { freq: 261.63, duration: 0.40, type: "sawtooth", volume: 0.18 },
  ],
  // Bright ding + rising chord
  levelUp: [
    { freq: 1174.66, duration: 0.08, type: "sine",   volume: 0.24 },
    { freq: 880.00,  duration: 0.08, type: "square", volume: 0.18 },
    { freq: 1046.50, duration: 0.08, type: "square", volume: 0.18 },
    { freq: 1318.51, duration: 0.20, type: "square", volume: 0.20 },
  ],
  // Short click + soft tone
  tileFlip: [
    { freq: 1800, duration: 0.025, type: "square",   volume: 0.12 },
    { freq: 600,  duration: 0.040, type: "triangle", volume: 0.15 },
  ],
  // Descending pitch sweep for explosion (simulated)
  explosion: [
    { freq: 260, duration: 0.05, type: "sawtooth", volume: 0.30 },
    { freq: 180, duration: 0.07, type: "sawtooth", volume: 0.28 },
    { freq: 120, duration: 0.09, type: "sawtooth", volume: 0.26 },
    { freq: 60,  duration: 0.20, type: "sawtooth", volume: 0.22 },
  ],
  // Quick pitch-up blip
  coinTick: [
    { freq: 1760, duration: 0.025, type: "square", volume: 0.14 },
  ],
  // Metallic clang
  shieldAbsorb: [
    { freq: 1108.73, duration: 0.08, type: "square",   volume: 0.22 },
    { freq: 880.00,  duration: 0.12, type: "triangle", volume: 0.18 },
    { freq: 1318.51, duration: 0.30, type: "sine",     volume: 0.14 },
  ],
  // Rising reveal chord
  voltorbReveal: [
    { freq: 523.25, duration: 0.08, type: "triangle", volume: 0.18 },
    { freq: 659.25, duration: 0.08, type: "triangle", volume: 0.18 },
    { freq: 783.99, duration: 0.20, type: "triangle", volume: 0.20 },
  ],
  // Short combo blip
  streakMilestone: [
    { freq: 880,  duration: 0.04, type: "square", volume: 0.18 },
    { freq: 1320, duration: 0.10, type: "square", volume: 0.20 },
  ],
  // Triumphant steady ascent
  checkpoint: [
    { freq: 659.25, duration: 0.12, type: "square", volume: 0.22 },
    { freq: 880.00, duration: 0.12, type: "square", volume: 0.22 },
    { freq: 1046.5, duration: 0.30, type: "square", volume: 0.24 },
  ],
};

export function synthStinger(ctx: AudioContext, kind: StingerKind, masterGain = 1): Promise<void> {
  const notes = STINGERS[kind];
  let t = ctx.currentTime;

  for (const note of notes) {
    const osc = ctx.createOscillator();
    osc.type = note.type ?? "square";
    osc.frequency.setValueAtTime(note.freq, t);
    if (note.detune) osc.detune.setValueAtTime(note.detune, t);

    const gain = ctx.createGain();
    const vol = (note.volume ?? 0.2) * masterGain;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.005);
    gain.gain.linearRampToValueAtTime(0.0001, t + note.duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + note.duration);

    t += note.duration;
  }

  return new Promise((resolve) => setTimeout(resolve, (t - ctx.currentTime) * 1000));
}

/**
 * Plays the Voltorb explosion — a noise burst + the descending pitch stinger.
 * More complex than a pure oscillator stinger so it gets its own helper.
 */
export function synthExplosion(ctx: AudioContext, masterGain = 1): void {
  const t = ctx.currentTime;

  // Noise burst
  const noiseDuration = 0.4;
  const sampleRate = ctx.sampleRate;
  const bufferSize = Math.floor(sampleRate * noiseDuration);
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = buffer;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.35 * masterGain, t);
  noiseGain.gain.linearRampToValueAtTime(0.0001, t + noiseDuration);
  noiseSrc.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseSrc.start(t);

  // Layered descending pitch (reuse the "explosion" stinger)
  synthStinger(ctx, "explosion", masterGain);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- audio.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/game/super-voltorb-flip/audio.ts src/components/game/super-voltorb-flip/__tests__/audio.test.ts
git commit -m "feat(voltorb-flip): add Web Audio API synthesized stingers"
```

---

## Task 8: Theme registry

**Files:**
- Create: `src/components/game/super-voltorb-flip/theme.ts`

- [ ] **Step 1: Create `theme.ts`**

```ts
// src/components/game/super-voltorb-flip/theme.ts
import type { ThemeId } from "./types";

export type ThemeDef = {
  id: ThemeId;
  name: string;
  description: string;
  cost: number;
  bgUrl: string;         // CSS background-image for the container
  bgmUrl: string;        // Menu BGM (round-level music overrides this)
  overlay?: string;      // Optional CSS overlay class name
  tilePalette?: {
    blank?: string;      // if set, a CSS filter/tint to apply to blank tiles
  };
};

const ASSETS = "/games/super-voltorb-flip";

export const THEMES: Record<ThemeId, ThemeDef> = {
  classic: {
    id: "classic",
    name: "Game Corner Classic",
    description: "The faithful HGSS recreation. Green DS background, pixel tiles.",
    cost: 0,
    bgUrl: `url(${ASSETS}/sprites/background.png)`,
    bgmUrl: `${ASSETS}/music/theme-classic.mp3`,
  },
  meadow: {
    id: "meadow",
    name: "Starter's Meadow",
    description: "Soft green meadow with wooden tile frames. A warm early-game vibe.",
    cost: 2500,
    bgUrl: `linear-gradient(180deg, #c8e88a 0%, #8fbf5a 100%)`,
    bgmUrl: `${ASSETS}/music/theme-meadow.mp3`,
    overlay: "meadow-grass-pattern",
  },
  twilight: {
    id: "twilight",
    name: "Twilight Route",
    description: "Orange-pink sunset, silhouetted trees in the distance.",
    cost: 5000,
    bgUrl: `linear-gradient(180deg, #ff9966 0%, #ff5e8a 60%, #6a2c70 100%)`,
    bgmUrl: `${ASSETS}/music/theme-twilight.mp3`,
    overlay: "twilight-silhouette",
  },
};

export const DEFAULT_THEME: ThemeId = "classic";
export const THEME_ORDER: ThemeId[] = ["classic", "meadow", "twilight"];
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/super-voltorb-flip/theme.ts
git commit -m "feat(voltorb-flip): add theme registry (classic, meadow, twilight)"
```

---

## Task 9: Base game component shell + register in games-client

**Files:**
- Create: `src/components/game/super-voltorb-flip.tsx`
- Modify: `src/app/games/games-client.tsx`

- [ ] **Step 1: Create the component shell**

```tsx
// src/components/game/super-voltorb-flip.tsx
"use client";

import { useEffect, useState } from "react";

export function SuperVoltorbFlipGame() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-[420px] rounded-xl border border-(--border) bg-(--card) flex items-center justify-center">
        <div className="text-(--muted) text-sm">Loading Super Voltorb Flip...</div>
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-xl border border-(--border) bg-(--card) overflow-hidden"
      style={{ aspectRatio: "4 / 3", minHeight: 420 }}
    >
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-(--muted)">
          <div className="text-lg font-semibold mb-2">Super Voltorb Flip</div>
          <div className="text-sm">Shell mounted. Implementation coming in subsequent tasks.</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register in games-client.tsx**

Open `src/app/games/games-client.tsx`. Add this dynamic import near the other game imports (after the existing `const SpaceShooterGame = dynamic(...)` block):

```tsx
const SuperVoltorbFlipGame = dynamic(
  () =>
    import("@/components/game/super-voltorb-flip").then(
      (m) => m.SuperVoltorbFlipGame
    ),
  { ssr: false, loading: () => <GameSkeleton /> }
);
```

Add `Zap` to the lucide-react import at the top of the file:

```tsx
import { Gamepad2, Keyboard, Trophy, RotateCcw, Rocket, Zap } from "lucide-react";
```

Add a new entry to the `GAMES` array (after the code-puzzle entry):

```tsx
{
  id: "super-voltorb-flip",
  title: "Super Voltorb Flip",
  description: "A faithful recreation of the HGSS classic — with modern upgrades. Deduce, flip, multiply your coins. Don't hit the Voltorb.",
  icon: Zap,
  iconColor: "text-accent-amber",
  available: true,
  controls: "Click tiles to flip. Open memo mode to mark possibilities. Spend coins on Shields & Reveals.",
},
```

Find the conditional render block (where `{activeGame === "space-shooter" && <SpaceShooterGame />}` appears) and add:

```tsx
{activeGame === "super-voltorb-flip" && <SuperVoltorbFlipGame />}
```

- [ ] **Step 3: Start dev server and visual-verify**

```bash
npm run dev
```

Open http://localhost:3000/games, pick the Super Voltorb Flip tile, confirm the shell renders with "Shell mounted" text. Check browser console for errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/super-voltorb-flip.tsx src/app/games/games-client.tsx
git commit -m "feat(voltorb-flip): add component shell and register in games-client"
```

---

## Task 10: Persistence hook (localStorage load/save)

**Files:**
- Create: `src/components/game/super-voltorb-flip/use-save.ts`

- [ ] **Step 1: Create the hook**

```ts
// src/components/game/super-voltorb-flip/use-save.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { INITIAL_STATS, type PersistedSave, type ThemeId } from "./types";

const SAVE_KEY = "super-voltorb-flip-save-v1";

const DEFAULT_SAVE: PersistedSave = {
  mode: null,
  totalCoins: 0,
  unlockedThemes: ["classic"],
  activeTheme: "classic",
  autoMemoEnabled: false,
  speedMode: false,
  musicVolume: 0.5,
  sfxVolume: 0.7,
  stats: { ...INITIAL_STATS },
};

export function loadSave(): PersistedSave {
  if (typeof window === "undefined") return { ...DEFAULT_SAVE };
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...DEFAULT_SAVE };
    const parsed = JSON.parse(raw) as Partial<PersistedSave>;
    return {
      ...DEFAULT_SAVE,
      ...parsed,
      stats: { ...INITIAL_STATS, ...(parsed.stats ?? {}) },
      unlockedThemes: Array.from(
        new Set([...(parsed.unlockedThemes ?? []), "classic"]),
      ) as ThemeId[],
    };
  } catch {
    return { ...DEFAULT_SAVE };
  }
}

export function writeSave(save: PersistedSave): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // ignore quota errors
  }
}

export function useSave(): [PersistedSave, (update: Partial<PersistedSave>) => void] {
  const [save, setSave] = useState<PersistedSave>(DEFAULT_SAVE);

  useEffect(() => {
    setSave(loadSave());
  }, []);

  const update = useCallback((patch: Partial<PersistedSave>) => {
    setSave((prev) => {
      const next = { ...prev, ...patch };
      writeSave(next);
      return next;
    });
  }, []);

  return [save, update];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/super-voltorb-flip/use-save.ts
git commit -m "feat(voltorb-flip): add localStorage save/load hook"
```

---

## Task 11: Mode-select screen (first-load choice)

**Files:**
- Modify: `src/components/game/super-voltorb-flip.tsx`

Per spec §9.2 decision 1: the mode is a one-time choice stored in localStorage.

- [ ] **Step 1: Replace the shell with a mode-select screen**

Overwrite `src/components/game/super-voltorb-flip.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Shield, Sparkles } from "lucide-react";
import { useSave } from "./super-voltorb-flip/use-save";
import type { GameMode } from "./super-voltorb-flip/types";

export function SuperVoltorbFlipGame() {
  const [mounted, setMounted] = useState(false);
  const [save, updateSave] = useSave();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <LoadingShell />;
  }

  if (save.mode === null) {
    return <ModeSelect onPick={(mode) => updateSave({ mode })} />;
  }

  return (
    <div
      className="w-full rounded-xl border border-(--border) bg-(--card) overflow-hidden"
      style={{ aspectRatio: "4 / 3", minHeight: 420 }}
    >
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-(--muted)">
          <div className="text-lg font-semibold mb-2">
            Playing in {save.mode === "classic" ? "Classic" : "Super"} Mode
          </div>
          <div className="text-sm">Board rendering comes in the next task.</div>
        </div>
      </div>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="w-full h-[420px] rounded-xl border border-(--border) bg-(--card) flex items-center justify-center">
      <div className="text-(--muted) text-sm">Loading Super Voltorb Flip...</div>
    </div>
  );
}

function ModeSelect({ onPick }: { onPick: (m: GameMode) => void }) {
  return (
    <div
      className="w-full rounded-xl border border-(--border) bg-(--card) p-8 flex flex-col items-center gap-6"
      style={{ minHeight: 420 }}
    >
      <div className="text-center">
        <h3 className="text-2xl font-bold mb-2">Choose your mode</h3>
        <p className="text-(--muted) text-sm">This choice is permanent. Both modes share stats; leaderboards are separate.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
        <button
          type="button"
          onClick={() => onPick("classic")}
          className="text-left p-6 rounded-xl border border-(--border) bg-(--bg) hover:border-accent-blue transition"
        >
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-accent-blue" />
            <h4 className="text-lg font-semibold">Classic Mode</h4>
          </div>
          <p className="text-sm text-(--muted)">
            The pure HGSS experience. No abilities, no soft drops, no power-ups.
            Hit a Voltorb, lose your coins, risk a big level crash. For purists.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onPick("super")}
          className="text-left p-6 rounded-xl border border-(--border) bg-(--bg) hover:border-accent-pink transition"
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-accent-pink" />
            <h4 className="text-lg font-semibold">Super Mode</h4>
          </div>
          <p className="text-sm text-(--muted)">
            Spend coins on Shield, Voltorb Reveal, and Cash Out. Softer level
            drops when you fail. Auto-memo, speed mode, and unlockable themes.
          </p>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Visual verify**

Dev server, open the game, verify mode-select screen appears. Click a card; it should immediately transition to the "Playing in X Mode" placeholder. Reload the page — it should skip the mode-select screen on subsequent visits.

- [ ] **Step 3: Temporarily reset to test the other mode**

In the browser console:
```js
localStorage.removeItem("super-voltorb-flip-save-v1"); location.reload();
```
Pick the other mode, verify.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb-flip): add one-time mode-select screen"
```

---

## Task 12: Core game state hook + initial board

**Files:**
- Create: `src/components/game/super-voltorb-flip/use-game.ts`

Central state machine. This hook owns the game state and exposes actions.

- [ ] **Step 1: Create the hook**

```ts
// src/components/game/super-voltorb-flip/use-game.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { generateBoard, computeHints, applyDrop } from "./board";
import { deduceAll } from "./auto-memo";
import type {
  GameMode,
  GameState,
  GamePhase,
  WeatherKind,
  TimeOfDay,
  Tile,
  MemoMarks,
  ThemeId,
} from "./types";
import { EMPTY_MEMOS, INITIAL_STATS } from "./types";

const WEATHERS: WeatherKind[] = ["clear", "sunny", "rainy", "snow", "sandstorm", "fog"];

function pickWeather(rng = Math.random): WeatherKind {
  // 1 in 5 rolls; majority "clear" for subtlety
  if (rng() < 0.7) return "clear";
  return WEATHERS[1 + Math.floor(rng() * (WEATHERS.length - 1))];
}

function getTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h >= 6 && h < 10) return "morning";
  if (h >= 10 && h < 17) return "day";
  if (h >= 17 && h < 20) return "evening";
  return "night";
}

export type GameAction =
  | { type: "flip"; row: number; col: number }
  | { type: "toggleMemo" }
  | { type: "setMemo"; row: number; col: number; memos: MemoMarks }
  | { type: "armShield" }
  | { type: "useVoltorbReveal" }
  | { type: "cashOut" }
  | { type: "continue" }
  | { type: "setTheme"; theme: ThemeId }
  | { type: "unlockTheme"; theme: ThemeId }
  | { type: "toggleAutoMemo" }
  | { type: "toggleSpeed" };

export type UseGameOptions = {
  mode: GameMode;
  initialTheme: ThemeId;
  unlockedThemes: ThemeId[];
  autoMemoEnabled: boolean;
  speedMode: boolean;
  totalCoins: number;
  onPersist: (patch: {
    totalCoins?: number;
    activeTheme?: ThemeId;
    unlockedThemes?: ThemeId[];
    autoMemoEnabled?: boolean;
    speedMode?: boolean;
    musicVolume?: number;
    sfxVolume?: number;
    stats?: GameState["stats"];
  }) => void;
};

export function useGame(opts: UseGameOptions) {
  const [state, setState] = useState<GameState>(() => {
    const { board, maxCoins } = generateBoard(1);
    const { rowHints, colHints } = computeHints(board);
    return {
      mode: opts.mode,
      phase: "ready",
      level: 1,
      board,
      rowHints,
      colHints,
      currentCoins: 0,
      totalCoins: opts.totalCoins,
      maxCoins,
      activeTheme: opts.initialTheme,
      unlockedThemes: new Set(opts.unlockedThemes),
      autoMemoEnabled: opts.autoMemoEnabled,
      speedMode: opts.speedMode,
      weather: pickWeather(),
      timeOfDay: getTimeOfDay(),
      shieldArmed: false,
      shieldedLoss: false,
      voltorbRevealsUsed: 0,
      successfulFlipsThisRound: 0,
      stats: { ...INITIAL_STATS },
    };
  });

  // Apply auto-memo when the toggle is on
  useEffect(() => {
    if (!state.autoMemoEnabled) return;
    if (state.phase !== "playing" && state.phase !== "ready" && state.phase !== "memo") return;
    setState((prev) => {
      const deduced = deduceAll(prev.board, prev.rowHints, prev.colHints);
      const newBoard: Tile[][] = prev.board.map((row, r) =>
        row.map((t, c) => (t.flipped ? t : { ...t, memos: deduced[r][c] })),
      );
      return { ...prev, board: newBoard };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.autoMemoEnabled, state.level]);

  // Placeholder reducer — real actions added in later tasks
  const dispatch = useCallback((action: GameAction) => {
    setState((s) => applyAction(s, action, opts));
  }, [opts]);

  return useMemo(() => ({ state, dispatch }), [state, dispatch]);
}

/**
 * Pure reducer for game actions. Heavy logic (animation scheduling) stays
 * in the component; this handles state transitions.
 */
export function applyAction(
  s: GameState,
  a: GameAction,
  opts: UseGameOptions,
): GameState {
  switch (a.type) {
    case "toggleMemo":
      if (s.phase === "playing") return { ...s, phase: "memo" };
      if (s.phase === "memo") return { ...s, phase: "playing" };
      return s;
    case "setMemo": {
      const board = s.board.map((row, r) =>
        row.map((t, c) => (r === a.row && c === a.col ? { ...t, memos: a.memos } : t)),
      );
      return { ...s, board };
    }
    case "toggleAutoMemo":
      opts.onPersist({ autoMemoEnabled: !s.autoMemoEnabled });
      return { ...s, autoMemoEnabled: !s.autoMemoEnabled };
    case "toggleSpeed":
      opts.onPersist({ speedMode: !s.speedMode });
      return { ...s, speedMode: !s.speedMode };
    case "setTheme":
      opts.onPersist({ activeTheme: a.theme });
      return { ...s, activeTheme: a.theme };
    case "unlockTheme": {
      const next = new Set(s.unlockedThemes);
      next.add(a.theme);
      opts.onPersist({ unlockedThemes: Array.from(next) });
      return { ...s, unlockedThemes: next };
    }
    default:
      return s; // flip, armShield, useVoltorbReveal, cashOut, continue added in later tasks
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/super-voltorb-flip/use-game.ts
git commit -m "feat(voltorb-flip): add core game state hook (partial reducer)"
```

---

## Task 13: Render 5×5 board with sprite tiles

**Files:**
- Modify: `src/components/game/super-voltorb-flip.tsx`
- Create: `src/components/game/super-voltorb-flip/Board.tsx`

Static rendering — no interactions yet. Uses pixelated sprites scaled to fit.

- [ ] **Step 1: Create `Board.tsx`**

```tsx
// src/components/game/super-voltorb-flip/Board.tsx
"use client";

import type { Tile } from "./types";

const SPRITES = "/games/super-voltorb-flip/sprites/tile";

const TILE_SRC: Record<number, string> = {
  0: `${SPRITES}/voltorb.png`,
  1: `${SPRITES}/1.png`,
  2: `${SPRITES}/2.png`,
  3: `${SPRITES}/3.png`,
};

const BLANK_SRC = `${SPRITES}/blank.png`;

export function Board({
  board,
  onTileClick,
}: {
  board: Tile[][];
  onTileClick?: (row: number, col: number) => void;
}) {
  return (
    <div
      className="grid gap-[2px]"
      style={{
        gridTemplateColumns: "repeat(5, 1fr)",
        imageRendering: "pixelated" as const,
      }}
    >
      {board.map((row, r) =>
        row.map((tile, c) => (
          <button
            key={`${r}-${c}`}
            type="button"
            onClick={() => onTileClick?.(r, c)}
            className="relative aspect-square bg-transparent border-0 cursor-pointer p-0"
            aria-label={
              tile.flipped
                ? `Tile ${r},${c} revealed: ${tile.value === 0 ? "Voltorb" : tile.value}`
                : `Tile ${r},${c} unrevealed`
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tile.flipped ? TILE_SRC[tile.value] : BLANK_SRC}
              alt=""
              className="w-full h-full select-none"
              style={{ imageRendering: "pixelated" as const }}
              draggable={false}
            />
          </button>
        )),
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire Board into the main component**

Replace the placeholder "Playing in X Mode" block in `super-voltorb-flip.tsx` with:

```tsx
import { Board } from "./super-voltorb-flip/Board";
import { useGame } from "./super-voltorb-flip/use-game";

// ... inside the component, after mode check ...

const { state, dispatch } = useGame({
  mode: save.mode,
  initialTheme: save.activeTheme,
  unlockedThemes: save.unlockedThemes,
  autoMemoEnabled: save.autoMemoEnabled,
  speedMode: save.speedMode,
  totalCoins: save.totalCoins,
  onPersist: updateSave,
});

return (
  <div
    className="w-full rounded-xl border border-(--border) overflow-hidden relative"
    style={{
      aspectRatio: "4 / 3",
      minHeight: 420,
      backgroundImage: `url(/games/super-voltorb-flip/sprites/background.png)`,
      backgroundSize: "cover",
      imageRendering: "pixelated" as const,
    }}
  >
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <Board board={state.board} />
      </div>
    </div>
  </div>
);
```

- [ ] **Step 3: Visual verify**

Dev server. Open the game, pick a mode. You should see the green DS background + a 5×5 grid of blank pixel tiles. Right-click to inspect and confirm sprites load (no 404s in network tab).

- [ ] **Step 4: Commit**

```bash
git add src/components/game/super-voltorb-flip.tsx src/components/game/super-voltorb-flip/Board.tsx
git commit -m "feat(voltorb-flip): render 5x5 board with pixel sprite tiles"
```

---

## Task 14: Info panels (row/column hints with sprite digits)

**Files:**
- Create: `src/components/game/super-voltorb-flip/InfoPanel.tsx`
- Modify: `src/components/game/super-voltorb-flip.tsx`

- [ ] **Step 1: Create `InfoPanel.tsx`**

```tsx
// src/components/game/super-voltorb-flip/InfoPanel.tsx
"use client";

import type { LineHint } from "./types";

const NUM = "/games/super-voltorb-flip/sprites/number";

function BoldDigit({ n }: { n: number }) {
  const idx = Math.max(0, Math.min(9, n));
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`${NUM}/bold_${idx}.png`}
      alt=""
      className="h-4 w-auto"
      style={{ imageRendering: "pixelated" as const }}
      draggable={false}
    />
  );
}

export function RowInfo({ hint }: { hint: LineHint }) {
  const tens = Math.floor(hint.points / 10);
  const ones = hint.points % 10;
  return (
    <div className="flex flex-col items-center justify-center gap-1 p-1 bg-white/10 rounded">
      <div className="flex gap-0.5">
        <BoldDigit n={tens} />
        <BoldDigit n={ones} />
      </div>
      <div className="h-px w-6 bg-white/40" />
      <BoldDigit n={hint.voltorbs} />
    </div>
  );
}

export function ColInfo({ hint }: { hint: LineHint }) {
  return <RowInfo hint={hint} />;
}
```

- [ ] **Step 2: Wire into layout (6×6 grid with info panels on right + bottom)**

Replace the Board-rendering block in `super-voltorb-flip.tsx` with a 6×6 grid:

```tsx
<div
  className="grid gap-[2px] w-full max-w-lg"
  style={{ gridTemplateColumns: "repeat(6, 1fr)" }}
>
  {state.board.map((row, r) => (
    <>
      {row.map((tile, c) => (
        <TileCell key={`t-${r}-${c}`} tile={tile} onClick={() => {}} />
      ))}
      <RowInfo key={`r-${r}`} hint={state.rowHints[r]} />
    </>
  ))}
  {state.colHints.map((h, c) => (
    <ColInfo key={`c-${c}`} hint={h} />
  ))}
  <div /> {/* bottom-right empty corner */}
</div>
```

Where `TileCell` is the `<button>` chunk from Task 13 extracted into a small inline component (or keep Board.tsx and pass hints in). The cleaner refactor: move Board rendering logic into a new `<Board>` that takes both `board` and `rowHints`/`colHints` and handles the whole 6×6 grid. Pick whichever keeps Board focused — recommended: let Board own the full grid.

**Recommended refactor** — replace `Board.tsx` with a version that takes hints:

```tsx
export function Board({
  board, rowHints, colHints, onTileClick,
}: {
  board: Tile[][];
  rowHints: LineHint[];
  colHints: LineHint[];
  onTileClick?: (row: number, col: number) => void;
}) {
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const tile = board[r][c];
      cells.push(
        <button key={`t-${r}-${c}`} type="button"
          onClick={() => onTileClick?.(r, c)}
          className="relative aspect-square bg-transparent border-0 cursor-pointer p-0"
          aria-label={`Tile ${r},${c}`}
        >
          <img src={tile.flipped ? TILE_SRC[tile.value] : BLANK_SRC} alt=""
            className="w-full h-full select-none"
            style={{ imageRendering: "pixelated" as const }} draggable={false} />
        </button>
      );
    }
    cells.push(<RowInfo key={`r-${r}`} hint={rowHints[r]} />);
  }
  for (let c = 0; c < 5; c++) cells.push(<ColInfo key={`c-${c}`} hint={colHints[c]} />);
  cells.push(<div key="corner" />);
  return (
    <div className="grid gap-[2px] w-full"
      style={{ gridTemplateColumns: "repeat(6, 1fr)",
        imageRendering: "pixelated" as const }}>
      {cells}
    </div>
  );
}
```

- [ ] **Step 3: Visual verify**

Reload. You should now see 5 row-info panels on the right, 5 column-info panels below, and the 5×5 grid of tiles. Check hint numbers look sane.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/super-voltorb-flip/InfoPanel.tsx src/components/game/super-voltorb-flip/Board.tsx src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb-flip): render row/column info panels with sprite digits"
```

---

## Task 15: Scoreboard (level, current coins, total coins)

**Files:**
- Create: `src/components/game/super-voltorb-flip/Scoreboard.tsx`
- Modify: `src/components/game/super-voltorb-flip.tsx`

- [ ] **Step 1: Create `Scoreboard.tsx`**

```tsx
// src/components/game/super-voltorb-flip/Scoreboard.tsx
"use client";

const NUM = "/games/super-voltorb-flip/sprites/number";

function BigDigit({ n }: { n: number }) {
  const idx = Math.max(0, Math.min(9, n));
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`${NUM}/big_${idx}.png`}
      alt=""
      className="h-8 w-auto"
      style={{ imageRendering: "pixelated" as const }}
      draggable={false}
    />
  );
}

function ThinDigit({ n }: { n: number }) {
  const idx = Math.max(1, Math.min(8, n));
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`${NUM}/thin_${idx}.png`}
      alt=""
      className="h-5 w-auto"
      style={{ imageRendering: "pixelated" as const }}
      draggable={false}
    />
  );
}

function padCoins(n: number, width = 5): number[] {
  const s = String(Math.max(0, Math.min(99999, n))).padStart(width, "0");
  return s.split("").map((ch) => Number(ch));
}

export function Scoreboard({
  level,
  currentCoins,
  totalCoins,
}: {
  level: number;
  currentCoins: number;
  totalCoins: number;
}) {
  return (
    <div className="flex flex-col gap-2 text-white text-xs font-mono">
      <div className="flex items-center gap-2">
        <span className="opacity-70">LV</span>
        <ThinDigit n={level} />
      </div>
      <div>
        <div className="opacity-70 text-[10px]">THIS ROUND</div>
        <div className="flex gap-0.5">
          {padCoins(currentCoins).map((d, i) => (
            <BigDigit key={i} n={d} />
          ))}
        </div>
      </div>
      <div>
        <div className="opacity-70 text-[10px]">TOTAL COINS</div>
        <div className="flex gap-0.5">
          {padCoins(totalCoins).map((d, i) => (
            <BigDigit key={i} n={d} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Place the scoreboard next to the board in the main component**

Wrap the Board in a two-column flex: board left, scoreboard right.

```tsx
<div className="absolute inset-0 flex items-center justify-center p-6">
  <div className="flex gap-4 items-start w-full max-w-2xl">
    <div className="flex-1"><Board ... /></div>
    <Scoreboard level={state.level} currentCoins={state.currentCoins} totalCoins={state.totalCoins} />
  </div>
</div>
```

- [ ] **Step 3: Visual verify**

Confirm level digit shows "1" and both coin counts show "00000".

- [ ] **Step 4: Commit**

```bash
git add src/components/game/super-voltorb-flip/Scoreboard.tsx src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb-flip): add scoreboard with sprite digit counts"
```

---

## Task 16: Tile flip animation + click → flip action

**Files:**
- Modify: `src/components/game/super-voltorb-flip/use-game.ts`
- Modify: `src/components/game/super-voltorb-flip/Board.tsx`

The flip animation runs through 3 sprite phases over 18 frames (samualtnorman's timing). Speed mode multiplies frame advance by 3.

- [ ] **Step 1: Extend the reducer to handle `flip`**

Edit `use-game.ts`, replace the `default:` arm with:

```ts
case "flip": {
  if (s.phase !== "playing" && s.phase !== "ready") return s;
  const tile = s.board[a.row][a.col];
  if (tile.flipped) return s;

  const board = s.board.map((row, r) =>
    row.map((t, c) =>
      r === a.row && c === a.col
        ? { ...t, flipped: true, animFrame: 0 }
        : t,
    ),
  );

  const newSuccessful = tile.value === 0 ? s.successfulFlipsThisRound : s.successfulFlipsThisRound + 1;
  const nextCoins = tile.value === 0 ? s.currentCoins : (s.currentCoins === 0 ? tile.value : s.currentCoins * tile.value);

  // Win check
  if (tile.value !== 0 && nextCoins === s.maxCoins) {
    return { ...s, board, phase: "won", currentCoins: nextCoins, successfulFlipsThisRound: newSuccessful };
  }

  // Lose check
  if (tile.value === 0) {
    if (s.mode === "super" && s.shieldArmed) {
      // Shield absorbs
      return {
        ...s, board, phase: "lost", shieldedLoss: true, shieldArmed: false,
        currentCoins: nextCoins, successfulFlipsThisRound: newSuccessful,
      };
    }
    return { ...s, board, phase: "lost", currentCoins: 0, successfulFlipsThisRound: newSuccessful };
  }

  return { ...s, board, phase: "playing", currentCoins: nextCoins, successfulFlipsThisRound: newSuccessful };
}
default:
  return s;
```

- [ ] **Step 2: Use flip-animation sprites during the `animFrame` period**

Update `Board.tsx` to render different sprites based on `animFrame`. The flip animation phases:
- frame 0-5: `blank.png` (just clicked)
- frame 6-11: `flip_0.png`
- frame 12-17: `flip_1.png`
- frame 18: value-specific flip sprite (e.g., `1_flip.png`)
- frame 19+: final value sprite

Replace the sprite selection:

```tsx
const SPRITES = "/games/super-voltorb-flip/sprites/tile";

function tileSprite(tile: Tile): string {
  if (!tile.flipped) return `${SPRITES}/blank.png`;
  if (tile.animFrame === null) {
    // animation complete — show final
    if (tile.value === 0) return `${SPRITES}/voltorb.png`;
    return `${SPRITES}/${tile.value}.png`;
  }
  const f = tile.animFrame;
  if (f < 6) return `${SPRITES}/blank.png`;
  if (f < 12) return `${SPRITES}/flip_0.png`;
  if (f < 18) return `${SPRITES}/flip_1.png`;
  if (f === 18) return tile.value === 0 ? `${SPRITES}/voltorb_flip.png` : `${SPRITES}/${tile.value}_flip.png`;
  return tile.value === 0 ? `${SPRITES}/voltorb.png` : `${SPRITES}/${tile.value}.png`;
}

// then in the map:
<img src={tileSprite(tile)} ... />
```

- [ ] **Step 3: Drive the animation loop in the main component**

In `super-voltorb-flip.tsx`, add an effect that advances `animFrame` via `requestAnimationFrame` while any tile is animating. Insert near the top of the main component:

```tsx
useEffect(() => {
  let raf = 0;
  let running = true;

  function tick() {
    if (!running) return;

    // Check if any tile is animating
    let hasAnimating = false;
    for (const row of state.board) {
      for (const tile of row) {
        if (tile.animFrame !== null) { hasAnimating = true; break; }
      }
      if (hasAnimating) break;
    }
    if (!hasAnimating) {
      raf = requestAnimationFrame(tick);
      return;
    }

    const step = state.speedMode ? 3 : 1;
    // Advance animFrame for every animating tile; clear when past 19
    // We dispatch a custom action — but to keep reducer pure, we do it inline:
    // (simplest: lift to a setState in the hook)
    // ... implementation detail: see Step 4
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  return () => { running = false; cancelAnimationFrame(raf); };
}, [state.board, state.speedMode]);
```

- [ ] **Step 4: Add an `advance` action to the reducer for animation ticks**

In `use-game.ts`, add a new `{ type: "advanceAnim"; step: number }` action:

```ts
case "advanceAnim": {
  let anyChange = false;
  const board = s.board.map((row) =>
    row.map((t) => {
      if (t.animFrame === null) return t;
      const next = t.animFrame + a.step;
      if (next > 19) {
        anyChange = true;
        return { ...t, animFrame: null };
      }
      anyChange = true;
      return { ...t, animFrame: next };
    }),
  );
  return anyChange ? { ...s, board } : s;
}
```

Update the type union:

```ts
export type GameAction =
  | ...
  | { type: "advanceAnim"; step: number };
```

Update the effect in `super-voltorb-flip.tsx` to dispatch `advanceAnim` instead of doing state work inline. Use a throttle so it advances once per frame at 60fps.

- [ ] **Step 5: Visual verify**

Dev server. Click a tile. It should flip through the 3 visual phases and land on its final value. Voltorbs explode visually by using the `voltorb.png` (explosion frames come in Task 17).

- [ ] **Step 6: Commit**

```bash
git add src/components/game/super-voltorb-flip/use-game.ts src/components/game/super-voltorb-flip/Board.tsx src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb-flip): tile flip animation and score multiplication"
```

---

## Task 17: Voltorb explosion animation

**Files:**
- Modify: `src/components/game/super-voltorb-flip/Board.tsx`
- Modify: `src/components/game/super-voltorb-flip/use-game.ts`

When a Voltorb is flipped, play the 9-frame explosion across ~60 frames.

- [ ] **Step 1: Extend animFrame range for Voltorbs**

Voltorb tiles use frames 0-17 for flip phases, 18-78 for explosion (9 frames × ~7 frames per sub-frame = 63 total; easier: 9 frames at ~7 frames each).

In `Board.tsx`:

```ts
function tileSprite(tile: Tile): string {
  if (!tile.flipped) return `${SPRITES}/blank.png`;
  const f = tile.animFrame;
  // Standard flip phases
  if (f === null || f >= 19) {
    if (tile.value === 0) {
      // Done exploding? show final voltorb sprite (or transparent if game fully lost)
      return `${SPRITES}/voltorb.png`;
    }
    return `${SPRITES}/${tile.value}.png`;
  }
  if (f < 6) return `${SPRITES}/blank.png`;
  if (f < 12) return `${SPRITES}/flip_0.png`;
  if (f < 18) return `${SPRITES}/flip_1.png`;
  if (f === 18) return tile.value === 0 ? `${SPRITES}/voltorb_flip.png` : `${SPRITES}/${tile.value}_flip.png`;
  // Explosion only for voltorb, otherwise handled above
  if (tile.value !== 0) return `${SPRITES}/${tile.value}.png`;
  // Explosion frames: map (f - 19) to 0..8 over ~63 frames
  const explodeFrame = Math.min(8, Math.floor((f - 19) / 7));
  return `${SPRITES}/explode_${explodeFrame}.png`;
}
```

- [ ] **Step 2: Extend the `advanceAnim` cutoff to cover explosion**

In `use-game.ts`, change `next > 19` to `next > (t.value === 0 ? 82 : 19)`:

```ts
case "advanceAnim": {
  const board = s.board.map((row) =>
    row.map((t) => {
      if (t.animFrame === null) return t;
      const next = t.animFrame + a.step;
      const limit = t.value === 0 ? 82 : 19;
      if (next > limit) return { ...t, animFrame: null };
      return { ...t, animFrame: next };
    }),
  );
  return { ...s, board };
}
```

- [ ] **Step 3: Visual verify**

Reset save, play until you hit a Voltorb. Confirm the 9-frame explosion plays across ~1 second.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/super-voltorb-flip/Board.tsx src/components/game/super-voltorb-flip/use-game.ts
git commit -m "feat(voltorb-flip): Voltorb explosion animation (9 frames)"
```

---

## Task 18: Win/lose states, continue action, level transitions

**Files:**
- Modify: `src/components/game/super-voltorb-flip/use-game.ts`
- Modify: `src/components/game/super-voltorb-flip.tsx`

- [ ] **Step 1: Extend reducer with `continue` action**

In `use-game.ts`:

```ts
case "continue": {
  if (s.phase === "won") {
    const newTotal = Math.min(99999, s.totalCoins + s.currentCoins);
    const newLevel = Math.min(8, s.level + 1);
    opts.onPersist({ totalCoins: newTotal });
    const { board, maxCoins } = generateBoard(newLevel);
    const { rowHints, colHints } = computeHints(board);
    return {
      ...s, phase: "ready", level: newLevel,
      board, rowHints, colHints,
      maxCoins, currentCoins: 0,
      totalCoins: newTotal,
      weather: pickWeather(), timeOfDay: getTimeOfDay(),
      shieldArmed: false, shieldedLoss: false, voltorbRevealsUsed: 0,
      successfulFlipsThisRound: 0,
    };
  }

  if (s.phase === "lost") {
    // Super Mode with shield? Keep coins, level unchanged.
    // Super Mode without shield? Softer drop.
    // Classic Mode? Weighted random drop (simplified: drop 1-2 levels).
    let newLevel = s.level;
    let totalGain = 0;
    if (s.shieldedLoss) {
      totalGain = s.currentCoins;
      // level unchanged
    } else if (s.mode === "super") {
      const requiredFlips = s.rowHints.reduce((acc, h) => acc + (h.points > 5 ? 1 : 0), 0);
      // Simpler: compute required from board (pre-stored)
      // Here we use successfulFlipsThisRound to drive drop:
      newLevel = applyDrop(s.level, Math.max(5, requiredFlips), s.successfulFlipsThisRound);
    } else {
      // Classic: HGSS-style weighted random drop (approximation: -2)
      newLevel = Math.max(1, s.level - 2);
    }
    const newTotal = Math.min(99999, s.totalCoins + totalGain);
    opts.onPersist({ totalCoins: newTotal });
    const { board, maxCoins } = generateBoard(newLevel);
    const { rowHints, colHints } = computeHints(board);
    return {
      ...s, phase: "ready", level: newLevel,
      board, rowHints, colHints,
      maxCoins, currentCoins: 0,
      totalCoins: newTotal,
      weather: pickWeather(), timeOfDay: getTimeOfDay(),
      shieldArmed: false, shieldedLoss: false, voltorbRevealsUsed: 0,
      successfulFlipsThisRound: 0,
    };
  }

  return s;
}
```

Also track `requiredFlips` as part of state (set when board generates) to make the softer drop accurate. Add `requiredFlips: number` to `GameState` and set it when generating board:

```ts
// In generateBoard, already returns twos and threes.
// In useGame initial state + continue: compute requiredFlips = twos + threes.
```

- [ ] **Step 2: Overlay a win/lose banner in the main component**

Add after the Board/Scoreboard render:

```tsx
{(state.phase === "won" || state.phase === "lost") && (
  <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
    <div className="bg-white/90 rounded-lg p-6 text-center max-w-sm">
      <div className="text-xl font-bold mb-2">
        {state.phase === "won"
          ? `Level ${state.level} Cleared!`
          : state.shieldedLoss
          ? `Shield Absorbed! Coins Saved.`
          : `Voltorb! Coins Lost.`}
      </div>
      <div className="text-sm text-gray-700 mb-4">
        {state.phase === "won"
          ? `+${state.currentCoins} coins`
          : state.shieldedLoss
          ? `Kept ${state.currentCoins} coins`
          : ""}
      </div>
      <button
        type="button"
        onClick={() => dispatch({ type: "continue" })}
        className="px-4 py-2 bg-accent-pink text-white rounded font-medium"
      >
        Continue
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Visual verify**

Play through several rounds. Confirm win banner on clearing, loss banner on Voltorb, level-up on win continue, level-down on lose continue.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/super-voltorb-flip/use-game.ts src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb-flip): win/lose states, continue flow, level transitions"
```

---

## Task 19: Memo system (toggle + marking + copy mode)

**Files:**
- Create: `src/components/game/super-voltorb-flip/MemoPanel.tsx`
- Modify: `src/components/game/super-voltorb-flip/Board.tsx`
- Modify: `src/components/game/super-voltorb-flip/use-game.ts`
- Modify: `src/components/game/super-voltorb-flip.tsx`

- [ ] **Step 1: Create `MemoPanel.tsx`**

```tsx
// src/components/game/super-voltorb-flip/MemoPanel.tsx
"use client";

import type { MemoMarks } from "./types";

const BTN = "/games/super-voltorb-flip/sprites/button/memo";

export function MemoPanel({
  open,
  selectedMemos,
  copyMode,
  onToggle,
  onMarkChange,
  onToggleCopy,
}: {
  open: boolean;
  selectedMemos: MemoMarks;
  copyMode: boolean;
  onToggle: () => void;
  onMarkChange: (idx: 0 | 1 | 2 | 3) => void;
  onToggleCopy: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 items-center p-2">
      <button
        type="button"
        onClick={onToggle}
        className="w-16 h-8 bg-transparent border-0 p-0 cursor-pointer"
        aria-label={open ? "Close Memo" : "Open Memo"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={open ? `${BTN}/close.png` : `${BTN}/open.png`}
          alt=""
          className="w-full h-full"
          style={{ imageRendering: "pixelated" as const }}
          draggable={false}
        />
      </button>

      {open && (
        <>
          <div className="grid grid-cols-2 gap-1">
            {[0, 1, 2, 3].map((i) => {
              const on = selectedMemos[i];
              // eslint-disable-next-line @next/next/no-img-element
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onMarkChange(i as 0 | 1 | 2 | 3)}
                  className="w-8 h-8 bg-transparent border-0 p-0 cursor-pointer"
                  aria-label={`Memo ${i === 0 ? "voltorb" : i}`}
                >
                  <img
                    src={`${BTN}/${i}_${on ? "on" : "off"}.png`}
                    alt=""
                    className="w-full h-full"
                    style={{ imageRendering: "pixelated" as const }}
                    draggable={false}
                  />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onToggleCopy}
            className="w-8 h-8 bg-transparent border-0 p-0 cursor-pointer"
            aria-label="Toggle memo copy mode"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${BTN}/${copyMode ? "s_on" : "s_off"}.png`}
              alt=""
              className="w-full h-full"
              style={{ imageRendering: "pixelated" as const }}
              draggable={false}
            />
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Track selected memo tile + copy mode in game state**

Add to `GameState`:

```ts
selectedMemoTile: { row: number; col: number } | null;
memoCopyMode: boolean;
```

Add actions:

```ts
| { type: "selectMemoTile"; row: number; col: number }
| { type: "toggleMemoMark"; idx: 0 | 1 | 2 | 3 }
| { type: "toggleMemoCopy" }
```

Reducer cases:

```ts
case "selectMemoTile":
  if (s.phase !== "memo") return s;
  const tile = s.board[a.row][a.col];
  if (tile.flipped) return s;
  // Apply copy from previously selected tile if copy mode is on
  let board = s.board;
  if (s.memoCopyMode && s.selectedMemoTile) {
    const src = s.board[s.selectedMemoTile.row][s.selectedMemoTile.col];
    board = s.board.map((row, r) =>
      row.map((t, c) =>
        r === a.row && c === a.col && !t.flipped
          ? { ...t, memos: src.memos }
          : t,
      ),
    );
  }
  return { ...s, board, selectedMemoTile: { row: a.row, col: a.col } };

case "toggleMemoMark": {
  if (s.phase !== "memo" || !s.selectedMemoTile) return s;
  const { row, col } = s.selectedMemoTile;
  const memos: MemoMarks = [...s.board[row][col].memos] as unknown as MemoMarks;
  memos[a.idx] = !memos[a.idx] as never;
  const board = s.board.map((r, ri) =>
    r.map((t, ci) => (ri === row && ci === col ? { ...t, memos } : t)),
  );
  return { ...s, board };
}

case "toggleMemoCopy":
  return { ...s, memoCopyMode: !s.memoCopyMode };
```

- [ ] **Step 3: In `Board.tsx`, route clicks to `selectMemoTile` when in memo mode**

Let the parent component decide via prop:

```tsx
<Board ... onTileClick={(r, c) => {
  if (state.phase === "memo") dispatch({ type: "selectMemoTile", row: r, col: c });
  else dispatch({ type: "flip", row: r, col: c });
}} />
```

- [ ] **Step 4: Render memo overlay marks on each tile**

In `Board.tsx`, when tile is unflipped and has any memo set, overlay small memo sprites:

```tsx
// inside the button, after the <img>:
{!tile.flipped && tile.memos.some(Boolean) && (
  <div className="absolute inset-0 grid grid-cols-2 gap-0 pointer-events-none">
    {tile.memos.map((on, i) =>
      on ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={`${SPRITES}/memo_${i}.png`} alt=""
          className="w-full h-full"
          style={{ imageRendering: "pixelated" as const }} />
      ) : <div key={i} />
    )}
  </div>
)}
```

- [ ] **Step 5: Mount `<MemoPanel>` in the main layout**

Next to Scoreboard, render MemoPanel wired to state:

```tsx
<MemoPanel
  open={state.phase === "memo"}
  selectedMemos={
    state.selectedMemoTile
      ? state.board[state.selectedMemoTile.row][state.selectedMemoTile.col].memos
      : [false, false, false, false]
  }
  copyMode={state.memoCopyMode}
  onToggle={() => dispatch({ type: "toggleMemo" })}
  onMarkChange={(idx) => dispatch({ type: "toggleMemoMark", idx })}
  onToggleCopy={() => dispatch({ type: "toggleMemoCopy" })}
/>
```

- [ ] **Step 6: Visual verify**

Open memo mode. Click a tile to select. Click memo buttons to mark. Toggle copy mode, click a different tile — confirm memos are copied. Close memo, verify tile flips work.

- [ ] **Step 7: Commit**

```bash
git add src/components/game/super-voltorb-flip/MemoPanel.tsx src/components/game/super-voltorb-flip/Board.tsx src/components/game/super-voltorb-flip/use-game.ts src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb-flip): memo mode with marking and copy-mode"
```

---

## Task 20: Super Mode abilities (Shield, Voltorb Reveal, Cash Out)

**Files:**
- Create: `src/components/game/super-voltorb-flip/AbilityBar.tsx`
- Modify: `src/components/game/super-voltorb-flip/use-game.ts`
- Modify: `src/components/game/super-voltorb-flip.tsx`

- [ ] **Step 1: Add ability reducer cases**

In `use-game.ts`:

```ts
case "armShield": {
  if (s.mode !== "super" || s.shieldArmed) return s;
  const cost = 200 * s.level;
  if (s.totalCoins < cost) return s;
  return { ...s, shieldArmed: true, totalCoins: s.totalCoins - cost };
}

case "useVoltorbReveal": {
  if (s.mode !== "super") return s;
  if (s.voltorbRevealsUsed >= 2) return s;
  const cost = 500 * s.level;
  if (s.totalCoins < cost) return s;
  // Find all unflipped voltorbs
  const hidden: Array<[number, number]> = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++)
      if (!s.board[r][c].flipped && s.board[r][c].value === 0) hidden.push([r, c]);
  if (hidden.length === 0) return s;
  const [rr, cc] = hidden[Math.floor(Math.random() * hidden.length)];
  // Flip it face-up but mark it visually revealed (we reuse flipped state; click on
  // it no longer does anything because it's already flipped).
  const board = s.board.map((row, r) =>
    row.map((t, c) =>
      r === rr && c === cc ? { ...t, flipped: true, animFrame: null } : t,
    ),
  );
  return {
    ...s, board,
    totalCoins: s.totalCoins - cost,
    voltorbRevealsUsed: s.voltorbRevealsUsed + 1,
  };
}

case "cashOut": {
  if (s.mode !== "super") return s;
  if (s.phase !== "playing" && s.phase !== "memo") return s;
  if (s.currentCoins === 0) return s;
  const newTotal = Math.min(99999, s.totalCoins + s.currentCoins);
  opts.onPersist({ totalCoins: newTotal });
  // Start a fresh board at the SAME level (cash out doesn't advance)
  const { board, maxCoins } = generateBoard(s.level);
  const { rowHints, colHints } = computeHints(board);
  return {
    ...s, phase: "ready",
    board, rowHints, colHints,
    maxCoins, currentCoins: 0, totalCoins: newTotal,
    shieldArmed: false, shieldedLoss: false, voltorbRevealsUsed: 0,
    successfulFlipsThisRound: 0,
    weather: pickWeather(), timeOfDay: getTimeOfDay(),
  };
}
```

- [ ] **Step 2: Create `AbilityBar.tsx`**

```tsx
// src/components/game/super-voltorb-flip/AbilityBar.tsx
"use client";

import { Shield, Eye, DoorOpen } from "lucide-react";

export function AbilityBar({
  level,
  totalCoins,
  shieldArmed,
  voltorbRevealsUsed,
  currentCoins,
  onArmShield,
  onUseReveal,
  onCashOut,
}: {
  level: number;
  totalCoins: number;
  shieldArmed: boolean;
  voltorbRevealsUsed: number;
  currentCoins: number;
  onArmShield: () => void;
  onUseReveal: () => void;
  onCashOut: () => void;
}) {
  const shieldCost = 200 * level;
  const revealCost = 500 * level;
  const canArm = totalCoins >= shieldCost && !shieldArmed;
  const canReveal = totalCoins >= revealCost && voltorbRevealsUsed < 2;
  const canCashOut = currentCoins > 0;

  return (
    <div className="flex gap-2 flex-wrap justify-center">
      <button
        type="button"
        disabled={!canArm}
        onClick={onArmShield}
        className="px-3 py-2 rounded-md border flex items-center gap-2 text-sm disabled:opacity-40"
        style={{
          borderColor: shieldArmed ? "#22c55e" : undefined,
          background: shieldArmed ? "rgba(34,197,94,0.15)" : "transparent",
        }}
      >
        <Shield className="w-4 h-4" />
        {shieldArmed ? "Shield Armed" : `Shield (${shieldCost}c)`}
      </button>
      <button
        type="button"
        disabled={!canReveal}
        onClick={onUseReveal}
        className="px-3 py-2 rounded-md border flex items-center gap-2 text-sm disabled:opacity-40"
      >
        <Eye className="w-4 h-4" />
        Reveal ({revealCost}c) · {2 - voltorbRevealsUsed} left
      </button>
      <button
        type="button"
        disabled={!canCashOut}
        onClick={() => {
          if (confirm(`Cash out with ${currentCoins} coins? Your level won't change.`)) {
            onCashOut();
          }
        }}
        className="px-3 py-2 rounded-md border flex items-center gap-2 text-sm disabled:opacity-40"
      >
        <DoorOpen className="w-4 h-4" />
        Cash Out
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Render AbilityBar in Super Mode**

In the main component, render AbilityBar below the game area when `state.mode === "super"`.

- [ ] **Step 4: Visual verify**

Start a new Super Mode game. Give yourself coins via console: `localStorage.setItem("super-voltorb-flip-save-v1", JSON.stringify({...JSON.parse(localStorage.getItem("super-voltorb-flip-save-v1")), totalCoins: 5000}))`, reload.

Verify: Arm Shield subtracts coins; hitting a Voltorb after arming preserves current coins. Voltorb Reveal exposes a random bomb and disables the button when 2 uses consumed. Cash Out prompts confirm, adds current to total, resets round at same level.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/super-voltorb-flip/AbilityBar.tsx src/components/game/super-voltorb-flip/use-game.ts src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb-flip): Shield, Voltorb Reveal, Cash Out abilities"
```

---

## Task 21: Auto-memo toggle + Speed mode toggle + settings menu

**Files:**
- Create: `src/components/game/super-voltorb-flip/SettingsMenu.tsx`
- Modify: `src/components/game/super-voltorb-flip.tsx`

- [ ] **Step 1: Create `SettingsMenu.tsx`**

```tsx
// src/components/game/super-voltorb-flip/SettingsMenu.tsx
"use client";

import { Settings } from "lucide-react";
import { useState } from "react";

export function SettingsMenu({
  mode,
  autoMemoEnabled,
  speedMode,
  musicVolume,
  sfxVolume,
  onToggleAutoMemo,
  onToggleSpeed,
  onMusicVolume,
  onSfxVolume,
}: {
  mode: "classic" | "super";
  autoMemoEnabled: boolean;
  speedMode: boolean;
  musicVolume: number;
  sfxVolume: number;
  onToggleAutoMemo: () => void;
  onToggleSpeed: () => void;
  onMusicVolume: (v: number) => void;
  onSfxVolume: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded border border-(--border)"
        aria-label="Settings"
      >
        <Settings className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-(--card) border border-(--border) rounded-lg p-4 w-72 z-20 flex flex-col gap-3 text-sm">
          {mode === "super" && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={autoMemoEnabled} onChange={onToggleAutoMemo} />
              Smart Auto-Memo
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={speedMode} onChange={onToggleSpeed} />
            Speed Mode (3× animations)
          </label>
          <label className="flex flex-col gap-1">
            <span>Music: {Math.round(musicVolume * 100)}%</span>
            <input type="range" min={0} max={1} step={0.05} value={musicVolume}
              onChange={(e) => onMusicVolume(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">
            <span>SFX: {Math.round(sfxVolume * 100)}%</span>
            <input type="range" min={0} max={1} step={0.05} value={sfxVolume}
              onChange={(e) => onSfxVolume(Number(e.target.value))} />
          </label>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into main component**

Mount the SettingsMenu in the top-right corner of the game container. Pass dispatch callbacks.

- [ ] **Step 3: Visual verify**

Toggle Auto-Memo — hints should auto-fill memo marks on unflipped tiles. Toggle Speed Mode — animations should triple. Slide volume — no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/super-voltorb-flip/SettingsMenu.tsx src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb-flip): settings menu with auto-memo, speed, volume"
```

---

## Task 22: Stats tracking (update on win/lose/cashout)

**Files:**
- Modify: `src/components/game/super-voltorb-flip/use-game.ts`
- Create: `src/components/game/super-voltorb-flip/StatsPanel.tsx`
- Modify: `src/components/game/super-voltorb-flip.tsx`

- [ ] **Step 1: Update stats in win/lose/cashout reducer cases**

In `use-game.ts` inside `continue` (won branch):

```ts
const newStats = {
  ...s.stats,
  gamesPlayed: s.stats.gamesPlayed + 1,
  wins: s.stats.wins + 1,
  currentStreak: s.stats.currentStreak + 1,
  bestStreak: Math.max(s.stats.bestStreak, s.stats.currentStreak + 1),
  highestSingleRoundCoins: Math.max(s.stats.highestSingleRoundCoins, s.currentCoins),
  highestLevelCleared: Math.max(s.stats.highestLevelCleared, s.level),
  lifetimeCoins: s.stats.lifetimeCoins + s.currentCoins,
};
opts.onPersist({ totalCoins: newTotal, stats: newStats });
```

In the lost branch:

```ts
const newStats = {
  ...s.stats,
  gamesPlayed: s.stats.gamesPlayed + 1,
  losses: s.stats.losses + 1,
  currentStreak: 0,
  highestSingleRoundCoins: s.shieldedLoss
    ? Math.max(s.stats.highestSingleRoundCoins, s.currentCoins)
    : s.stats.highestSingleRoundCoins,
  lifetimeCoins: s.stats.lifetimeCoins + (s.shieldedLoss ? s.currentCoins : 0),
};
opts.onPersist({ totalCoins: newTotal, stats: newStats });
```

In cashOut:

```ts
const newStats = {
  ...s.stats,
  gamesPlayed: s.stats.gamesPlayed + 1,
  highestSingleRoundCoins: Math.max(s.stats.highestSingleRoundCoins, s.currentCoins),
  lifetimeCoins: s.stats.lifetimeCoins + s.currentCoins,
};
opts.onPersist({ totalCoins: newTotal, stats: newStats });
```

- [ ] **Step 2: Create `StatsPanel.tsx`**

```tsx
// src/components/game/super-voltorb-flip/StatsPanel.tsx
"use client";

import type { Stats } from "./types";

export function StatsPanel({ stats }: { stats: Stats }) {
  const winRate = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;
  return (
    <details className="border border-(--border) rounded-lg p-3 bg-(--card)">
      <summary className="cursor-pointer font-medium text-sm">Stats</summary>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <dt className="opacity-70">Games Played</dt><dd>{stats.gamesPlayed}</dd>
        <dt className="opacity-70">Wins / Losses</dt><dd>{stats.wins} / {stats.losses}</dd>
        <dt className="opacity-70">Win Rate</dt><dd>{winRate}%</dd>
        <dt className="opacity-70">Current Streak</dt><dd>{stats.currentStreak}</dd>
        <dt className="opacity-70">Best Streak</dt><dd>{stats.bestStreak}</dd>
        <dt className="opacity-70">Best Round</dt><dd>{stats.highestSingleRoundCoins} coins</dd>
        <dt className="opacity-70">Highest Level</dt><dd>{stats.highestLevelCleared}</dd>
        <dt className="opacity-70">Lifetime Coins</dt><dd>{stats.lifetimeCoins}</dd>
      </dl>
    </details>
  );
}
```

- [ ] **Step 3: Mount StatsPanel below the game area**

- [ ] **Step 4: Visual verify**

Play multiple rounds. Confirm stats update and persist across reloads.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/super-voltorb-flip/use-game.ts src/components/game/super-voltorb-flip/StatsPanel.tsx src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb-flip): lifetime stats tracking + collapsible panel"
```

---

## Task 23: Theme switcher + unlock flow

**Files:**
- Create: `src/components/game/super-voltorb-flip/ThemeSwitcher.tsx`
- Modify: `src/components/game/super-voltorb-flip.tsx`
- Modify: `src/components/game/super-voltorb-flip/use-game.ts`

- [ ] **Step 1: Add `unlockAndSelectTheme` action**

In `use-game.ts`:

```ts
case "unlockTheme": {
  const themeDef = THEMES[a.theme];
  if (s.unlockedThemes.has(a.theme)) {
    opts.onPersist({ activeTheme: a.theme });
    return { ...s, activeTheme: a.theme };
  }
  if (s.totalCoins < themeDef.cost) return s;
  const unlocked = new Set(s.unlockedThemes);
  unlocked.add(a.theme);
  const newTotal = s.totalCoins - themeDef.cost;
  opts.onPersist({
    totalCoins: newTotal,
    unlockedThemes: Array.from(unlocked),
    activeTheme: a.theme,
  });
  return { ...s, totalCoins: newTotal, unlockedThemes: unlocked, activeTheme: a.theme };
}
```

Import `THEMES` at the top of `use-game.ts`.

- [ ] **Step 2: Create `ThemeSwitcher.tsx`**

```tsx
// src/components/game/super-voltorb-flip/ThemeSwitcher.tsx
"use client";

import type { ThemeId } from "./types";
import { THEMES, THEME_ORDER } from "./theme";

export function ThemeSwitcher({
  unlocked,
  active,
  totalCoins,
  onSelect,
}: {
  unlocked: Set<ThemeId>;
  active: ThemeId;
  totalCoins: number;
  onSelect: (id: ThemeId) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {THEME_ORDER.map((id) => {
        const t = THEMES[id];
        const isUnlocked = unlocked.has(id);
        const affordable = totalCoins >= t.cost;
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (isUnlocked || affordable) {
                if (!isUnlocked && !confirm(`Unlock ${t.name} for ${t.cost} coins?`)) return;
                onSelect(id);
              }
            }}
            className="px-3 py-2 rounded border text-xs flex flex-col items-start gap-1"
            style={{
              borderColor: isActive ? "#a855f7" : undefined,
              background: isActive ? "rgba(168,85,247,0.12)" : "transparent",
              opacity: !isUnlocked && !affordable ? 0.4 : 1,
            }}
            disabled={!isUnlocked && !affordable}
          >
            <div className="font-semibold">{t.name}</div>
            <div className="opacity-70">
              {isUnlocked ? (isActive ? "Active" : "Owned") : `${t.cost}c`}
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Apply the active theme's background**

In the main game container style:

```tsx
style={{
  backgroundImage: THEMES[state.activeTheme].bgUrl,
  backgroundSize: "cover",
  // ...
}}
```

Import `THEMES` at the top.

- [ ] **Step 4: Visual verify**

Grant yourself 10000 coins in localStorage. Confirm Meadow and Twilight themes unlock and change the background. Verify affordability logic.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/super-voltorb-flip/ThemeSwitcher.tsx src/components/game/super-voltorb-flip/use-game.ts src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb-flip): theme switcher with unlock-on-click"
```

---

## Task 24: Day/Night cycle + weather overlays

**Files:**
- Create: `src/components/game/super-voltorb-flip/Atmosphere.tsx`
- Modify: `src/components/game/super-voltorb-flip.tsx`

- [ ] **Step 1: Create `Atmosphere.tsx`**

```tsx
// src/components/game/super-voltorb-flip/Atmosphere.tsx
"use client";

import type { TimeOfDay, WeatherKind } from "./types";

const TIME_TINT: Record<TimeOfDay, string> = {
  morning:  "rgba(255, 180, 120, 0.08)",
  day:      "transparent",
  evening:  "rgba(255, 120, 80, 0.10)",
  night:    "rgba(40, 60, 140, 0.18)",
};

export function Atmosphere({
  timeOfDay,
  weather,
}: {
  timeOfDay: TimeOfDay;
  weather: WeatherKind;
}) {
  return (
    <>
      {/* Time-of-day tint */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: TIME_TINT[timeOfDay] }}
      />
      {/* Weather particle overlays */}
      {weather === "rainy" && <RainOverlay />}
      {weather === "snow" && <SnowOverlay />}
      {weather === "sandstorm" && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "rgba(200, 180, 120, 0.18)" }} />
      )}
      {weather === "fog" && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "rgba(200, 200, 220, 0.22)" }} />
      )}
      {weather === "sunny" && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "rgba(255, 240, 180, 0.08)" }} />
      )}
      {/* Night stars */}
      {timeOfDay === "night" && <NightStars />}
    </>
  );
}

function RainOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 40 }).map((_, i) => (
        <span
          key={i}
          className="absolute top-0 w-[1px] h-4 bg-blue-200/50"
          style={{
            left: `${(i * 7) % 100}%`,
            animation: `svf-rain 0.6s linear ${(i % 10) * 0.05}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes svf-rain { 0% { transform: translateY(-20%); } 100% { transform: translateY(420px); } }`}</style>
    </div>
  );
}

function SnowOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 30 }).map((_, i) => (
        <span
          key={i}
          className="absolute top-0 w-1 h-1 rounded-full bg-white/80"
          style={{
            left: `${(i * 11) % 100}%`,
            animation: `svf-snow 4s linear ${(i % 10) * 0.4}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes svf-snow { 0% { transform: translateY(-10%) translateX(0); } 100% { transform: translateY(420px) translateX(20px); } }`}</style>
    </div>
  );
}

function NightStars() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {Array.from({ length: 20 }).map((_, i) => (
        <span
          key={i}
          className="absolute w-1 h-1 rounded-full bg-white"
          style={{
            left: `${(i * 13) % 100}%`,
            top: `${(i * 7) % 60}%`,
            opacity: 0.5 + 0.5 * Math.abs(Math.sin(i)),
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Mount `<Atmosphere>` inside the game container**

```tsx
<div className="...game container...">
  <Atmosphere timeOfDay={state.timeOfDay} weather={state.weather} />
  {/* board + scoreboard + memopanel */}
</div>
```

- [ ] **Step 3: Visual verify**

Force different weather by editing the generator briefly to always return "rainy" / "snow" / "fog" etc. Confirm overlays render correctly and don't block clicks. Revert the force.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/super-voltorb-flip/Atmosphere.tsx src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb-flip): day/night cycle + weather overlay effects"
```

---

## Task 25: BGM system (level-tier music + theme music with crossfade)

**Files:**
- Modify: `src/components/game/super-voltorb-flip/audio.ts`
- Modify: `src/components/game/super-voltorb-flip.tsx`

- [ ] **Step 1: Add BGM helpers to `audio.ts`**

```ts
export class BgmPlayer {
  private ctx: AudioContext;
  private current: { src: AudioBufferSourceNode; gain: GainNode; url: string } | null = null;
  private masterGain: GainNode;
  private buffers = new Map<string, AudioBuffer>();

  constructor(ctx: AudioContext, masterVolume = 0.5) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = masterVolume;
    this.masterGain.connect(ctx.destination);
  }

  setVolume(v: number) {
    this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private async loadBuffer(url: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(url);
    if (cached) return cached;
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await this.ctx.decodeAudioData(arr);
    this.buffers.set(url, buf);
    return buf;
  }

  async crossfadeTo(url: string, fadeDuration = 1.0): Promise<void> {
    if (this.current?.url === url) return;
    const buf = await this.loadBuffer(url);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(this.masterGain);
    src.start(this.ctx.currentTime);

    const now = this.ctx.currentTime;
    gain.gain.linearRampToValueAtTime(1, now + fadeDuration);

    const old = this.current;
    if (old) {
      old.gain.gain.linearRampToValueAtTime(0, now + fadeDuration);
      setTimeout(() => {
        try { old.src.stop(); } catch {}
      }, (fadeDuration + 0.1) * 1000);
    }

    this.current = { src, gain, url };
  }

  stop() {
    if (this.current) {
      try { this.current.src.stop(); } catch {}
      this.current = null;
    }
  }
}
```

- [ ] **Step 2: Wire BGM into the main component**

```tsx
const audioCtxRef = useRef<AudioContext | null>(null);
const bgmRef = useRef<BgmPlayer | null>(null);

// Initialize AudioContext on first user gesture
const ensureAudio = useCallback(() => {
  if (!audioCtxRef.current) {
    audioCtxRef.current = new AudioContext();
    bgmRef.current = new BgmPlayer(audioCtxRef.current, save.musicVolume);
  }
  if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
}, [save.musicVolume]);

// Update BGM on level or theme change
useEffect(() => {
  const bgm = bgmRef.current;
  if (!bgm) return;
  const tier =
    state.level <= 3 ? "rookie" :
    state.level <= 6 ? "veteran" : "master";
  const url = state.phase === "ready" || state.phase === "playing" || state.phase === "memo"
    ? `/games/super-voltorb-flip/music/${tier}.mp3`
    : THEMES[state.activeTheme].bgmUrl;
  bgm.crossfadeTo(url).catch(() => {});
}, [state.level, state.activeTheme, state.phase]);

// Keep volume in sync
useEffect(() => { bgmRef.current?.setVolume(save.musicVolume); }, [save.musicVolume]);
```

Ensure `ensureAudio()` is called on the first tile click, mode-select click, etc.

- [ ] **Step 3: Visual verify**

First interaction starts music. Advancing a level crossfades to the next tier. Switching theme from the ThemeSwitcher crossfades to the theme's BGM.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/super-voltorb-flip/audio.ts src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb-flip): BGM system with crossfade between tier/theme tracks"
```

---

## Task 26: Wire synthesized stingers to game events

**Files:**
- Modify: `src/components/game/super-voltorb-flip.tsx`

- [ ] **Step 1: Add effect hooks that fire stingers on state changes**

```tsx
const prevPhaseRef = useRef(state.phase);
const prevCoinsRef = useRef(state.currentCoins);

useEffect(() => {
  const ctx = audioCtxRef.current;
  if (!ctx) return;
  const vol = save.sfxVolume;
  if (prevPhaseRef.current !== state.phase) {
    if (state.phase === "won") synthStinger(ctx, "win", vol);
    if (state.phase === "lost") {
      if (state.shieldedLoss) synthStinger(ctx, "shieldAbsorb", vol);
      else synthExplosion(ctx, vol);
    }
    if (prevPhaseRef.current === "won" && state.phase === "ready") {
      synthStinger(ctx, "levelUp", vol);
    }
    prevPhaseRef.current = state.phase;
  }
  if (state.currentCoins > prevCoinsRef.current) {
    synthStinger(ctx, "coinTick", vol);
  }
  prevCoinsRef.current = state.currentCoins;
}, [state.phase, state.currentCoins, state.shieldedLoss, save.sfxVolume]);
```

Also fire `tileFlip` directly from the click handler before dispatching:

```tsx
const handleTileClick = (r: number, c: number) => {
  ensureAudio();
  if (state.phase === "memo") {
    dispatch({ type: "selectMemoTile", row: r, col: c });
  } else {
    if (!state.board[r][c].flipped && audioCtxRef.current) {
      synthStinger(audioCtxRef.current, "tileFlip", save.sfxVolume);
    }
    dispatch({ type: "flip", row: r, col: c });
  }
};
```

Similarly fire `shieldAbsorb`, `voltorbReveal`, etc. when dispatching those actions.

- [ ] **Step 2: Visual/audio verify**

Every tile flip makes a click. Win fanfare on clear. Descending explosion on Voltorb. Shield clang when a shield absorbs. Reveal chord on Voltorb Reveal.

- [ ] **Step 3: Commit**

```bash
git add src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb-flip): wire synthesized stingers to game events"
```

---

## Task 27: Leaderboard submission on new personal best

**Files:**
- Modify: `src/components/game/super-voltorb-flip.tsx`

The existing `/api/leaderboard` endpoint accepts submissions. Look at `src/app/api/leaderboard/route.ts` first to confirm the expected shape — adapt the payload below to match.

- [ ] **Step 1: Detect new personal best and prompt for name**

Add an effect that detects when `stats.highestSingleRoundCoins` changed during a win/cashout:

```tsx
const lastSubmittedRef = useRef(save.stats.highestSingleRoundCoins);
const [pendingSubmit, setPendingSubmit] = useState<number | null>(null);
const [nameInput, setNameInput] = useState("");

useEffect(() => {
  if (state.stats.highestSingleRoundCoins > lastSubmittedRef.current) {
    setPendingSubmit(state.stats.highestSingleRoundCoins);
  }
  lastSubmittedRef.current = state.stats.highestSingleRoundCoins;
}, [state.stats.highestSingleRoundCoins]);

async function submitScore() {
  if (pendingSubmit === null) return;
  try {
    await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: "super-voltorb-flip",
        mode: state.mode,
        name: nameInput.slice(0, 12),
        score: pendingSubmit,
        level: state.level,
      }),
    });
  } catch {}
  setPendingSubmit(null);
  setNameInput("");
}
```

- [ ] **Step 2: Render a small name-entry modal**

```tsx
{pendingSubmit !== null && (
  <div className="absolute inset-0 z-30 bg-black/60 flex items-center justify-center">
    <div className="bg-(--card) p-6 rounded-lg max-w-sm text-center">
      <h4 className="font-bold mb-2">New Personal Best: {pendingSubmit} coins!</h4>
      <input
        type="text"
        maxLength={12}
        value={nameInput}
        onChange={(e) => setNameInput(e.target.value)}
        placeholder="Your name"
        className="w-full px-3 py-2 rounded border border-(--border) bg-(--bg) mb-3"
      />
      <div className="flex gap-2 justify-center">
        <button type="button" onClick={submitScore}
          className="px-4 py-2 rounded bg-accent-pink text-white">Submit</button>
        <button type="button" onClick={() => setPendingSubmit(null)}
          className="px-4 py-2 rounded border border-(--border)">Skip</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Visual verify**

Play until you beat your previous high score. Confirm the name entry modal appears and submission succeeds (check Network tab).

- [ ] **Step 4: Commit**

```bash
git add src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb-flip): leaderboard submission on personal-best"
```

---

## Task 28: Responsive scaling and final polish

**Files:**
- Modify: `src/components/game/super-voltorb-flip.tsx`

- [ ] **Step 1: Ensure the game scales on mobile**

Wrap the game grid in a max-width container that fits in mobile viewports:

```tsx
<div className="w-full mx-auto max-w-xl px-2 sm:px-0">
  {/* all game contents */}
</div>
```

Make the AbilityBar wrap on small screens (already does with `flex-wrap`).

On `<640px`, move Scoreboard above the Board rather than side-by-side. Use `flex-col sm:flex-row`.

- [ ] **Step 2: Verify on mobile viewport**

In browser devtools, set viewport to 375×812 (iPhone 13). The game should fit with no horizontal scrollbar. Tiles should remain clickable. Text should not overflow.

- [ ] **Step 3: Smoke-check the production build**

```bash
npm run build
```

Confirm no build errors. If there are warnings about unused imports, clean them up.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/super-voltorb-flip.tsx
git commit -m "feat(voltorb-flip): responsive mobile layout"
```

---

## Task 29: Final end-to-end browser verification

Walk through every feature manually. This task has no code changes — it's the ship gate.

- [ ] **Step 1: Reset save, enter Classic Mode**

```js
localStorage.removeItem("super-voltorb-flip-save-v1"); location.reload();
```

Pick Classic. Verify:
- Abilities bar is hidden (Classic has no abilities)
- Auto-memo toggle hidden in settings
- Level-down on Voltorb uses HGSS-style (drops 2 levels from current)

- [ ] **Step 2: Reset again, enter Super Mode**

Verify:
- All abilities visible + priced correctly
- Auto-memo toggle visible
- Shield: arms, subtracts cost, absorbs a Voltorb, round ends safely
- Voltorb Reveal: exposes a random hidden bomb, counter decrements
- Cash Out: confirm dialog, ends round at same level
- Softer drop: with 5+ successful flips, drop is 0 or 1 level only

- [ ] **Step 3: Theme switching**

- Set coins to 10,000 via console. Unlock Meadow. Background changes. BGM crossfades.
- Unlock Twilight. Background changes again.

- [ ] **Step 4: Stats persistence**

- Note current stats. Reload page. Stats should match (not reset).

- [ ] **Step 5: Day/Night + Weather**

- Refresh several times. Weather should vary (rain/snow/fog visible in some rounds).
- Verify time-of-day tint feels right for current clock time.

- [ ] **Step 6: Audio**

- Music volume slider affects BGM.
- SFX volume slider affects all stingers.
- Stingers fire on: tile flip, win, lose, level up, coin tick, shield absorb, Voltorb reveal.

- [ ] **Step 7: Leaderboard**

- Beat your personal best. Name entry modal appears. Submit. Open Network tab, confirm `/api/leaderboard` POST returned 200.

- [ ] **Step 8: Build check**

```bash
npm run build
```

Expected: clean build. No errors.

- [ ] **Step 9: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Run all tests**

```bash
npm test
```

Expected: all tests pass (levels, board, auto-memo, audio, plus any existing portfolio tests).

- [ ] **Step 11: Final commit (if any polish changes needed)**

If the walkthrough revealed issues, fix them in separate commits and return to this task. Once everything passes:

```bash
git log --oneline docs/superpowers/specs/2026-04-15-super-voltorb-flip-design.md..HEAD -- src/components/game/super-voltorb-flip* public/games/super-voltorb-flip* | head
```

Confirm the commit history tells a clean story.

---

## Self-Review Checklist

Before shipping Phase 1:

- [ ] Every requirement in the spec maps to a task above
- [ ] No `TODO`, `TBD`, or "similar to above" placeholders in any task
- [ ] Type names are consistent across tasks (`GameState`, `GameAction`, etc.)
- [ ] Each task commits at the end — no uncommitted work spanning tasks
- [ ] Each task's test (where applicable) fails before the implementation step
- [ ] Browser verification is included for every UI-affecting task
- [ ] The production build compiles cleanly after every task

## Out of Scope — Phase 2+

The following were brainstormed during design but deferred. Plan in follow-up work when Phase 1 is shipped and stable:

- Game modes: Tower, Roguelike, Endless, Daily Puzzle, Zen
- Abilities: Safe Peek, Row/Column Scan, Double Down
- Streak Bonus, Level Checkpoints
- Gym Badge / Legendary / Champion theme tiers
- New tile types: Chain, Unstable Voltorbs, x4 Jackpot, Power-Up
- Board evolution: Growing, Irregular, Hex
- Prestige, Upgrade Tree, Voltorb Collection, Achievements
- Random events: Lucky Egg, Amulet Coin, Radio Broadcast, Swarm Day, Bug Hunt, Training Round, Wild Reserve, Mysterious Glow, Rainbow After Rain, Shiny Encounter
- Nature Traits
- Undo
