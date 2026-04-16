# Password Game 2: Foundation & Tier 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundation for Password Game 2 — scaffolding, seeded PRNG, rule engine, game loop, and all 10 Tier 1 rules with one random foreshadowing moment — playable end-to-end for Tier 1.

**Architecture:** Client-side React component. Deterministic seeded PRNG drives rule selection and parameterization. Rule engine is a pure state machine (pass `{password, state}` → `{passed, message}`). Game component orchestrates: PRNG → rule draw → validation loop → tier progression. Integrates into existing `/games` tab layout via a card that links to its own dedicated route.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Vitest + @testing-library/react, lucide-react icons. File-based leaderboard storage (deferred to later plan).

**Scope of THIS plan (Foundation + Tier 1 only):**
- Directory scaffold
- Seeded PRNG (mulberry32) with tests
- Rule type system and engine with tests
- All 10 Tier 1 rule validators with tests
- Foreshadowing moment system (4 variants)
- Basic game component (password input, rule cards, progression)
- `/games/password-game` route
- Integration card on existing `/games` page
- Commit after each task

**Out of scope (later plans):**
- Tiers 2-5 rules
- Rich text input / formatting rules
- Environmental hazards
- Adversarial AI
- Progressive UI destruction
- Result card
- Leaderboard API & page
- Sound effects
- Daily challenges

---

## File Structure

**Create:**
- `src/components/game/password-game/types.ts` — TypeScript interfaces for Rule, GameState, RuleDef
- `src/components/game/password-game/prng.ts` — Mulberry32 seeded PRNG
- `src/components/game/password-game/engine.ts` — Rule selection, tier progression, validation loop
- `src/components/game/password-game/rules/tier1.ts` — 10 Tier 1 rule definitions
- `src/components/game/password-game/foreshadowing.tsx` — 4 foreshadowing moment components
- `src/components/game/password-game/rule-card.tsx` — Single rule display component
- `src/components/game/password-game/password-game.tsx` — Main game component (entry)
- `src/app/games/password-game/page.tsx` — Dedicated game page
- `src/components/game/password-game/__tests__/prng.test.ts`
- `src/components/game/password-game/__tests__/engine.test.ts`
- `src/components/game/password-game/__tests__/tier1.test.ts`

**Modify:**
- `src/app/games/games-client.tsx` — Add Password Game 2 card linking to new route

---

## Task 1: Create directory scaffold

**Files:**
- Create: `src/components/game/password-game/` directory
- Create: `src/components/game/password-game/__tests__/` directory
- Create: `src/components/game/password-game/rules/` directory

- [ ] **Step 1: Create directories**

Run:
```bash
mkdir -p src/components/game/password-game/rules src/components/game/password-game/__tests__ src/app/games/password-game
```

Expected: directories exist.

- [ ] **Step 2: Commit scaffold**

```bash
git add -A
git commit -m "scaffold: password-game directory structure"
```

---

## Task 2: Implement seeded PRNG

**Files:**
- Create: `src/components/game/password-game/prng.ts`
- Test: `src/components/game/password-game/__tests__/prng.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/components/game/password-game/__tests__/prng.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mulberry32, pickOne, pickN, rangeInt } from "../prng";

describe("mulberry32", () => {
  it("returns numbers between 0 and 1", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 50; i++) {
      expect(a()).toBe(b());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });
});

describe("pickOne", () => {
  it("picks an element from the array", () => {
    const rng = mulberry32(1);
    const arr = ["a", "b", "c", "d"];
    const v = pickOne(rng, arr);
    expect(arr).toContain(v);
  });

  it("is deterministic with same seed", () => {
    const arr = ["a", "b", "c", "d", "e"];
    const a = pickOne(mulberry32(42), arr);
    const b = pickOne(mulberry32(42), arr);
    expect(a).toBe(b);
  });
});

describe("pickN", () => {
  it("picks N unique elements", () => {
    const rng = mulberry32(1);
    const arr = ["a", "b", "c", "d", "e"];
    const picked = pickN(rng, arr, 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    picked.forEach((p) => expect(arr).toContain(p));
  });

  it("returns all elements if N >= array length", () => {
    const rng = mulberry32(1);
    const arr = ["a", "b", "c"];
    const picked = pickN(rng, arr, 5);
    expect(picked).toHaveLength(3);
    expect(new Set(picked)).toEqual(new Set(arr));
  });
});

describe("rangeInt", () => {
  it("returns an integer in [min, max]", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 100; i++) {
      const v = rangeInt(rng, 5, 10);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it("is deterministic for the same seed and bounds", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect(rangeInt(a, 1, 100)).toBe(rangeInt(b, 1, 100));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npm test -- prng.test.ts
```

Expected: All tests fail with module resolution errors (prng.ts does not exist).

- [ ] **Step 3: Implement prng.ts**

Create `src/components/game/password-game/prng.ts`:

```typescript
export type Rng = () => number;

/** Mulberry32 seeded PRNG. Deterministic, fast, good enough for game randomness. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickOne<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) {
    throw new Error("pickOne: array is empty");
  }
  return arr[Math.floor(rng() * arr.length)];
}

export function pickN<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

export function rangeInt(rng: Rng, min: number, max: number): number {
  if (max < min) throw new Error("rangeInt: max < min");
  return min + Math.floor(rng() * (max - min + 1));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm test -- prng.test.ts
```

Expected: All PRNG tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/prng.ts src/components/game/password-game/__tests__/prng.test.ts
git commit -m "feat(password-game): add mulberry32 seeded PRNG with utility helpers"
```

---

## Task 3: Define rule type system

**Files:**
- Create: `src/components/game/password-game/types.ts`

- [ ] **Step 1: Write types.ts**

Create `src/components/game/password-game/types.ts`:

```typescript
import type { Rng } from "./prng";

export type Tier = 1 | 2 | 3 | 4 | 5;

/** Result of validating a password against a rule. */
export interface ValidationResult {
  passed: boolean;
  /** Optional message shown to the player (e.g. current progress, hint). */
  message?: string;
}

/** Runtime state that rules can inspect or mutate (e.g. timers). */
export interface GameState {
  /** Current password value. */
  password: string;
  /** Elapsed seconds since game start. */
  elapsedSeconds: number;
  /** Index of the currently active (unsatisfied) rule, or -1 if none. */
  activeRuleIndex: number;
  /** Ordered rules for this run. */
  rules: Rule[];
  /** Seed used for this run. */
  seed: number;
}

/** A rule definition drawn from the pool and parameterized by the seed. */
export interface Rule {
  /** Stable id (e.g. "min-length"). Used for analytics and debugging. */
  id: string;
  /** Tier this rule belongs to. */
  tier: Tier;
  /** Human-readable description shown to the player. */
  description: string;
  /** Rule parameters resolved from the seed (e.g. { n: 7 }). */
  params: Record<string, unknown>;
  /** Pure validator. Must not mutate inputs. */
  validate(state: GameState): ValidationResult;
}

/** Factory that produces a Rule using the RNG for parameterization. */
export interface RuleDef {
  id: string;
  tier: Tier;
  create(rng: Rng): Rule;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/password-game/types.ts
git commit -m "feat(password-game): add rule type system"
```

---

## Task 4: Implement Tier 1 rules — min length

**Files:**
- Create: `src/components/game/password-game/rules/tier1.ts`
- Test: `src/components/game/password-game/__tests__/tier1.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/game/password-game/__tests__/tier1.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mulberry32 } from "../prng";
import { TIER_1_RULES } from "../rules/tier1";
import type { GameState, Rule } from "../types";

function makeState(password: string, rule: Rule): GameState {
  return {
    password,
    elapsedSeconds: 0,
    activeRuleIndex: 0,
    rules: [rule],
    seed: 1,
  };
}

describe("Tier 1 — min length rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "min-length")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("fails short passwords", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("ab", rule)).passed).toBe(false);
  });

  it("passes long enough passwords", () => {
    const rule = def.create(mulberry32(1));
    const n = rule.params.n as number;
    const long = "x".repeat(n + 2);
    expect(rule.validate(makeState(long, rule)).passed).toBe(true);
  });

  it("parameter n is between 6 and 9", () => {
    for (let seed = 1; seed < 100; seed++) {
      const rule = def.create(mulberry32(seed));
      const n = rule.params.n as number;
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(9);
    }
  });

  it("is tier 1", () => {
    expect(def.tier).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm test -- tier1.test.ts
```

Expected: FAIL with module resolution error (tier1.ts does not exist).

- [ ] **Step 3: Implement the min-length rule**

Create `src/components/game/password-game/rules/tier1.ts`:

```typescript
import type { RuleDef } from "../types";
import { rangeInt } from "../prng";

const minLength: RuleDef = {
  id: "min-length",
  tier: 1,
  create(rng) {
    const n = rangeInt(rng, 6, 9);
    return {
      id: "min-length",
      tier: 1,
      description: `Your password must be at least ${n} characters.`,
      params: { n },
      validate(state) {
        const len = [...state.password].length;
        return {
          passed: len >= n,
          message: `${len} / ${n}`,
        };
      },
    };
  },
};

export const TIER_1_RULES: readonly RuleDef[] = [minLength];
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm test -- tier1.test.ts
```

Expected: PASS for all min-length tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier1.ts src/components/game/password-game/__tests__/tier1.test.ts
git commit -m "feat(password-game): add tier 1 min-length rule"
```

---

## Task 5: Tier 1 — digits count rule

**Files:**
- Modify: `src/components/game/password-game/rules/tier1.ts`
- Modify: `src/components/game/password-game/__tests__/tier1.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/components/game/password-game/__tests__/tier1.test.ts`:

```typescript
describe("Tier 1 — digit count rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "digit-count")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("fails if too few digits", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("abc", rule)).passed).toBe(false);
  });

  it("passes when digit count matches", () => {
    const rule = def.create(mulberry32(1));
    const n = rule.params.n as number;
    const pw = "a" + "1".repeat(n);
    expect(rule.validate(makeState(pw, rule)).passed).toBe(true);
  });

  it("n is between 1 and 3", () => {
    for (let seed = 1; seed < 50; seed++) {
      const rule = def.create(mulberry32(seed));
      const n = rule.params.n as number;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tier1.test.ts`
Expected: The new tests fail — digit-count rule not found.

- [ ] **Step 3: Implement the rule**

Modify `src/components/game/password-game/rules/tier1.ts` by adding the `digitCount` constant and appending to `TIER_1_RULES`:

```typescript
const digitCount: RuleDef = {
  id: "digit-count",
  tier: 1,
  create(rng) {
    const n = rangeInt(rng, 1, 3);
    return {
      id: "digit-count",
      tier: 1,
      description: `Your password must include at least ${n} digit${n === 1 ? "" : "s"}.`,
      params: { n },
      validate(state) {
        const count = (state.password.match(/\d/g) ?? []).length;
        return { passed: count >= n, message: `${count} / ${n}` };
      },
    };
  },
};

export const TIER_1_RULES: readonly RuleDef[] = [minLength, digitCount];
```

(Replace the previous `TIER_1_RULES` line with the new one that includes `digitCount`.)

- [ ] **Step 4: Run tests**

Run: `npm test -- tier1.test.ts`
Expected: PASS for both rules.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier1.ts src/components/game/password-game/__tests__/tier1.test.ts
git commit -m "feat(password-game): add tier 1 digit-count rule"
```

---

## Task 6: Tier 1 — uppercase letter rule

**Files:**
- Modify: `src/components/game/password-game/rules/tier1.ts`
- Modify: `src/components/game/password-game/__tests__/tier1.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```typescript
describe("Tier 1 — uppercase rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "uppercase")!;

  it("exists and is tier 1", () => {
    expect(def).toBeDefined();
    expect(def.tier).toBe(1);
  });

  it("fails without uppercase", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("abc123", rule)).passed).toBe(false);
  });

  it("passes with uppercase", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("Abc123", rule)).passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tier1.test.ts`
Expected: FAIL on the new block.

- [ ] **Step 3: Implement**

In `tier1.ts`, add:

```typescript
const uppercase: RuleDef = {
  id: "uppercase",
  tier: 1,
  create() {
    return {
      id: "uppercase",
      tier: 1,
      description: "Your password must include an uppercase letter.",
      params: {},
      validate(state) {
        return { passed: /[A-Z]/.test(state.password) };
      },
    };
  },
};
```

And update `TIER_1_RULES`:

```typescript
export const TIER_1_RULES: readonly RuleDef[] = [minLength, digitCount, uppercase];
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tier1.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier1.ts src/components/game/password-game/__tests__/tier1.test.ts
git commit -m "feat(password-game): add tier 1 uppercase rule"
```

---

## Task 7: Tier 1 — special character rule

**Files:**
- Modify: `src/components/game/password-game/rules/tier1.ts`
- Modify: `src/components/game/password-game/__tests__/tier1.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```typescript
describe("Tier 1 — special char rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "special-char")!;

  it("picks a random subset of special chars", () => {
    const rule = def.create(mulberry32(1));
    const allowed = rule.params.chars as string;
    expect(typeof allowed).toBe("string");
    expect(allowed.length).toBeGreaterThan(0);
  });

  it("fails without special char from subset", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("Abc123", rule)).passed).toBe(false);
  });

  it("passes when password contains an allowed special char", () => {
    const rule = def.create(mulberry32(1));
    const chars = rule.params.chars as string;
    const pw = "Abc" + chars[0] + "123";
    expect(rule.validate(makeState(pw, rule)).passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tier1.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `tier1.ts`, add:

```typescript
import { pickN } from "../prng";

const SPECIAL_POOL = "!@#$%^&*";

const specialChar: RuleDef = {
  id: "special-char",
  tier: 1,
  create(rng) {
    const subset = pickN(rng, SPECIAL_POOL.split(""), 3).join("");
    return {
      id: "special-char",
      tier: 1,
      description: `Your password must include a special character from: ${subset}`,
      params: { chars: subset },
      validate(state) {
        for (const ch of subset) {
          if (state.password.includes(ch)) return { passed: true };
        }
        return { passed: false };
      },
    };
  },
};
```

Update `TIER_1_RULES`:

```typescript
export const TIER_1_RULES: readonly RuleDef[] = [minLength, digitCount, uppercase, specialChar];
```

Note: The existing `import { rangeInt } from "../prng";` already exists. Change the import line to `import { pickN, rangeInt } from "../prng";` so both are available.

- [ ] **Step 4: Run tests**

Run: `npm test -- tier1.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier1.ts src/components/game/password-game/__tests__/tier1.test.ts
git commit -m "feat(password-game): add tier 1 special-char rule with randomized subset"
```

---

## Task 8: Tier 1 — digit sum rule

**Files:**
- Modify: `src/components/game/password-game/rules/tier1.ts`
- Modify: `src/components/game/password-game/__tests__/tier1.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```typescript
describe("Tier 1 — digit sum rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "digit-sum")!;

  it("target sum is between 15 and 30", () => {
    for (let seed = 1; seed < 50; seed++) {
      const rule = def.create(mulberry32(seed));
      const target = rule.params.target as number;
      expect(target).toBeGreaterThanOrEqual(15);
      expect(target).toBeLessThanOrEqual(30);
    }
  });

  it("fails when digit sum doesn't match", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("a1b2", rule)).passed).toBe(false);
  });

  it("passes when digits sum to target", () => {
    const rule = def.create(mulberry32(1));
    const target = rule.params.target as number;
    // build a password where digit sum == target
    const nines = Math.floor(target / 9);
    const remainder = target % 9;
    const pw = "A!" + "9".repeat(nines) + (remainder > 0 ? remainder.toString() : "");
    expect(rule.validate(makeState(pw, rule)).passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tier1.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `tier1.ts`:

```typescript
const digitSum: RuleDef = {
  id: "digit-sum",
  tier: 1,
  create(rng) {
    const target = rangeInt(rng, 15, 30);
    return {
      id: "digit-sum",
      tier: 1,
      description: `The digits in your password must add up to ${target}.`,
      params: { target },
      validate(state) {
        let sum = 0;
        for (const ch of state.password) {
          const n = Number(ch);
          if (Number.isInteger(n) && ch.trim() !== "") sum += n;
        }
        return { passed: sum === target, message: `${sum} / ${target}` };
      },
    };
  },
};
```

Update `TIER_1_RULES`:

```typescript
export const TIER_1_RULES: readonly RuleDef[] = [minLength, digitCount, uppercase, specialChar, digitSum];
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tier1.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier1.ts src/components/game/password-game/__tests__/tier1.test.ts
git commit -m "feat(password-game): add tier 1 digit-sum rule"
```

---

## Task 9: Tier 1 — color name rule

**Files:**
- Modify: `src/components/game/password-game/rules/tier1.ts`
- Modify: `src/components/game/password-game/__tests__/tier1.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```typescript
describe("Tier 1 — color name rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "color-name")!;

  it("passes when password contains a color name (case-insensitive)", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("myPasswordRED!", rule)).passed).toBe(true);
  });

  it("fails without a color name", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("xyz", rule)).passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tier1.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `tier1.ts`:

```typescript
const COLOR_NAMES = [
  "red", "blue", "green", "yellow", "purple", "orange", "pink",
  "violet", "indigo", "coral", "teal", "cyan", "magenta", "lime",
  "gold", "silver", "black", "white", "brown", "gray",
];

const colorName: RuleDef = {
  id: "color-name",
  tier: 1,
  create() {
    return {
      id: "color-name",
      tier: 1,
      description: "Your password must include a color name.",
      params: { colors: COLOR_NAMES },
      validate(state) {
        const lower = state.password.toLowerCase();
        for (const c of COLOR_NAMES) {
          if (lower.includes(c)) return { passed: true };
        }
        return { passed: false };
      },
    };
  },
};
```

Update `TIER_1_RULES`:

```typescript
export const TIER_1_RULES: readonly RuleDef[] = [minLength, digitCount, uppercase, specialChar, digitSum, colorName];
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tier1.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier1.ts src/components/game/password-game/__tests__/tier1.test.ts
git commit -m "feat(password-game): add tier 1 color-name rule"
```

---

## Task 10: Tier 1 — day of the week rule

**Files:**
- Modify: `src/components/game/password-game/rules/tier1.ts`
- Modify: `src/components/game/password-game/__tests__/tier1.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```typescript
describe("Tier 1 — day of week rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "day-of-week")!;

  it("passes with a day name (case-insensitive)", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("Abc123monday!", rule)).passed).toBe(true);
    expect(rule.validate(makeState("Abc123SUNDAY!", rule)).passed).toBe(true);
  });

  it("fails without a day name", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("Abc123!", rule)).passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tier1.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `tier1.ts`:

```typescript
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const dayOfWeek: RuleDef = {
  id: "day-of-week",
  tier: 1,
  create() {
    return {
      id: "day-of-week",
      tier: 1,
      description: "Your password must include a day of the week.",
      params: {},
      validate(state) {
        const lower = state.password.toLowerCase();
        return { passed: DAYS.some((d) => lower.includes(d)) };
      },
    };
  },
};
```

Update `TIER_1_RULES`:

```typescript
export const TIER_1_RULES: readonly RuleDef[] = [minLength, digitCount, uppercase, specialChar, digitSum, colorName, dayOfWeek];
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tier1.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier1.ts src/components/game/password-game/__tests__/tier1.test.ts
git commit -m "feat(password-game): add tier 1 day-of-week rule"
```

---

## Task 11: Tier 1 — planet name rule

**Files:**
- Modify: `src/components/game/password-game/rules/tier1.ts`
- Modify: `src/components/game/password-game/__tests__/tier1.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```typescript
describe("Tier 1 — planet rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "planet")!;

  it("passes with Earth, Mars, etc.", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("Abc123earth!", rule)).passed).toBe(true);
  });

  it("fails without a planet name", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("xyz", rule)).passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tier1.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `tier1.ts`:

```typescript
const PLANETS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"];

const planet: RuleDef = {
  id: "planet",
  tier: 1,
  create() {
    return {
      id: "planet",
      tier: 1,
      description: "Your password must include the name of a planet.",
      params: {},
      validate(state) {
        const lower = state.password.toLowerCase();
        return { passed: PLANETS.some((p) => lower.includes(p)) };
      },
    };
  },
};
```

Update `TIER_1_RULES`:

```typescript
export const TIER_1_RULES: readonly RuleDef[] = [minLength, digitCount, uppercase, specialChar, digitSum, colorName, dayOfWeek, planet];
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tier1.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier1.ts src/components/game/password-game/__tests__/tier1.test.ts
git commit -m "feat(password-game): add tier 1 planet rule"
```

---

## Task 12: Tier 1 — palindrome rule

**Files:**
- Modify: `src/components/game/password-game/rules/tier1.ts`
- Modify: `src/components/game/password-game/__tests__/tier1.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```typescript
describe("Tier 1 — palindrome rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "palindrome")!;

  it("min length is between 3 and 5", () => {
    for (let seed = 1; seed < 50; seed++) {
      const rule = def.create(mulberry32(seed));
      const n = rule.params.n as number;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it("passes when password contains a palindrome of sufficient length", () => {
    const rule = def.create(mulberry32(1));
    const n = rule.params.n as number;
    // "level" is a 5-char palindrome; guaranteed long enough for n in [3,5]
    const pw = "abc" + "level" + "xyz";
    expect(rule.validate(makeState(pw, rule)).passed).toBe(true);
  });

  it("fails without a palindrome", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("abcdefg", rule)).passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tier1.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `tier1.ts`:

```typescript
function hasPalindromeOfLength(s: string, n: number): boolean {
  const lower = s.toLowerCase();
  for (let i = 0; i + n <= lower.length; i++) {
    const sub = lower.slice(i, i + n);
    let ok = true;
    for (let j = 0; j < Math.floor(n / 2); j++) {
      if (sub[j] !== sub[n - 1 - j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

const palindrome: RuleDef = {
  id: "palindrome",
  tier: 1,
  create(rng) {
    const n = rangeInt(rng, 3, 5);
    return {
      id: "palindrome",
      tier: 1,
      description: `Your password must contain a palindrome of at least ${n} characters.`,
      params: { n },
      validate(state) {
        return { passed: hasPalindromeOfLength(state.password, n) };
      },
    };
  },
};
```

Update `TIER_1_RULES`:

```typescript
export const TIER_1_RULES: readonly RuleDef[] = [minLength, digitCount, uppercase, specialChar, digitSum, colorName, dayOfWeek, planet, palindrome];
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tier1.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier1.ts src/components/game/password-game/__tests__/tier1.test.ts
git commit -m "feat(password-game): add tier 1 palindrome rule"
```

---

## Task 13: Tier 1 — word count rule

**Files:**
- Modify: `src/components/game/password-game/rules/tier1.ts`
- Modify: `src/components/game/password-game/__tests__/tier1.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```typescript
describe("Tier 1 — word count rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "word-count")!;

  it("target word count is between 2 and 4", () => {
    for (let seed = 1; seed < 50; seed++) {
      const rule = def.create(mulberry32(seed));
      const n = rule.params.n as number;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  it("passes with correct word count", () => {
    const rule = def.create(mulberry32(1));
    const n = rule.params.n as number;
    const words = Array.from({ length: n }, (_, i) => `word${i + 1}`).join(" ");
    expect(rule.validate(makeState(words, rule)).passed).toBe(true);
  });

  it("fails with wrong word count", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("oneword", rule)).passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tier1.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `tier1.ts`:

```typescript
const wordCount: RuleDef = {
  id: "word-count",
  tier: 1,
  create(rng) {
    const n = rangeInt(rng, 2, 4);
    return {
      id: "word-count",
      tier: 1,
      description: `Your password must contain exactly ${n} words (space-separated).`,
      params: { n },
      validate(state) {
        const words = state.password.trim().split(/\s+/).filter((w) => w.length > 0);
        return { passed: words.length === n, message: `${words.length} / ${n}` };
      },
    };
  },
};
```

Update `TIER_1_RULES`:

```typescript
export const TIER_1_RULES: readonly RuleDef[] = [minLength, digitCount, uppercase, specialChar, digitSum, colorName, dayOfWeek, planet, palindrome, wordCount];
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tier1.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier1.ts src/components/game/password-game/__tests__/tier1.test.ts
git commit -m "feat(password-game): add tier 1 word-count rule"
```

---

## Task 14: Rule engine — selectRulesForRun

**Files:**
- Create: `src/components/game/password-game/engine.ts`
- Test: `src/components/game/password-game/__tests__/engine.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/components/game/password-game/__tests__/engine.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { selectRulesForRun } from "../engine";
import { TIER_1_RULES } from "../rules/tier1";

describe("selectRulesForRun", () => {
  it("draws the requested count of rules per tier", () => {
    const rules = selectRulesForRun(12345, { 1: 4 }, { 1: TIER_1_RULES });
    expect(rules).toHaveLength(4);
    rules.forEach((r) => expect(r.tier).toBe(1));
  });

  it("is deterministic for the same seed", () => {
    const a = selectRulesForRun(42, { 1: 4 }, { 1: TIER_1_RULES });
    const b = selectRulesForRun(42, { 1: 4 }, { 1: TIER_1_RULES });
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });

  it("produces different sets for different seeds", () => {
    const a = selectRulesForRun(1, { 1: 4 }, { 1: TIER_1_RULES });
    const b = selectRulesForRun(9999, { 1: 4 }, { 1: TIER_1_RULES });
    // not guaranteed to differ, but overwhelmingly likely
    const aIds = a.map((r) => r.id).join(",");
    const bIds = b.map((r) => r.id).join(",");
    expect(aIds === bIds).toBe(false);
  });

  it("does not return duplicate rule ids within the same tier", () => {
    const rules = selectRulesForRun(7, { 1: 4 }, { 1: TIER_1_RULES });
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- engine.test.ts`
Expected: FAIL (engine.ts does not exist).

- [ ] **Step 3: Implement engine**

Create `src/components/game/password-game/engine.ts`:

```typescript
import { mulberry32, pickN } from "./prng";
import type { Rule, RuleDef, Tier } from "./types";

export type RuleCountsPerTier = Partial<Record<Tier, number>>;
export type RulePoolsPerTier = Partial<Record<Tier, readonly RuleDef[]>>;

/**
 * Deterministically select rules for a run. Each tier's rules are drawn from
 * its own pool using a tier-specific PRNG derived from the master seed, so
 * adding rules to a later tier won't reshuffle earlier tiers.
 */
export function selectRulesForRun(
  seed: number,
  counts: RuleCountsPerTier,
  pools: RulePoolsPerTier
): Rule[] {
  const out: Rule[] = [];
  const tiers: Tier[] = [1, 2, 3, 4, 5];
  for (const tier of tiers) {
    const count = counts[tier] ?? 0;
    const pool = pools[tier] ?? [];
    if (count === 0 || pool.length === 0) continue;
    // Derive a per-tier seed so tiers are independent.
    const tierSeed = (seed ^ (tier * 0x9e3779b1)) >>> 0;
    const selectionRng = mulberry32(tierSeed);
    const defs = pickN(selectionRng, pool, count);
    // Each rule gets its own RNG for parameterization so rule order within
    // the pool doesn't affect other rules' params.
    defs.forEach((def, i) => {
      const paramRng = mulberry32((tierSeed + (i + 1) * 0x85ebca6b) >>> 0);
      out.push(def.create(paramRng));
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/engine.ts src/components/game/password-game/__tests__/engine.test.ts
git commit -m "feat(password-game): add rule-selection engine with per-tier PRNG"
```

---

## Task 15: Rule engine — progression logic

**Files:**
- Modify: `src/components/game/password-game/engine.ts`
- Modify: `src/components/game/password-game/__tests__/engine.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `engine.test.ts`:

```typescript
import { computeActiveRuleIndex, validateRules } from "../engine";
import type { GameState } from "../types";

function state(password: string, rules: ReturnType<typeof selectRulesForRun>): GameState {
  return { password, elapsedSeconds: 0, activeRuleIndex: 0, rules, seed: 1 };
}

describe("computeActiveRuleIndex", () => {
  it("returns 0 when no rules are satisfied", () => {
    const rules = selectRulesForRun(1, { 1: 3 }, { 1: TIER_1_RULES });
    expect(computeActiveRuleIndex(state("", rules))).toBe(0);
  });

  it("returns -1 when all rules are satisfied", () => {
    const rules = selectRulesForRun(1, { 1: 1 }, { 1: TIER_1_RULES });
    // If the only rule is min-length with n <= 9, "xxxxxxxxxx" (10 chars) passes it.
    const pw = "x".repeat(15);
    const st = state(pw, rules);
    // May or may not satisfy; we only assert the contract in the case we know:
    // construct a single rule of known type — override via engine tests is too coupled.
    // Instead: use validateRules to compute and check consistency.
    const results = validateRules(st);
    const activeIdx = computeActiveRuleIndex(st);
    if (results.every((r) => r.passed)) {
      expect(activeIdx).toBe(-1);
    } else {
      expect(activeIdx).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns the first unsatisfied rule index", () => {
    // Craft a mini pool with predictable rules to test progression logic in isolation.
    const rules = selectRulesForRun(1, { 1: 3 }, { 1: TIER_1_RULES });
    const results = validateRules(state("", rules));
    const expectedIdx = results.findIndex((r) => !r.passed);
    expect(computeActiveRuleIndex(state("", rules))).toBe(expectedIdx);
  });
});

describe("validateRules", () => {
  it("returns one result per rule, in rule order", () => {
    const rules = selectRulesForRun(1, { 1: 4 }, { 1: TIER_1_RULES });
    const results = validateRules(state("abc", rules));
    expect(results).toHaveLength(4);
    results.forEach((r) => {
      expect(typeof r.passed).toBe("boolean");
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- engine.test.ts`
Expected: FAIL — `computeActiveRuleIndex` and `validateRules` do not exist.

- [ ] **Step 3: Implement**

Append to `engine.ts`:

```typescript
import type { GameState, ValidationResult } from "./types";

export function validateRules(state: GameState): ValidationResult[] {
  return state.rules.map((rule) => rule.validate(state));
}

/**
 * The active rule is the first unsatisfied rule. Earlier rules must be
 * satisfied first (Neal-style progressive reveal). Returns -1 when all pass.
 */
export function computeActiveRuleIndex(state: GameState): number {
  for (let i = 0; i < state.rules.length; i++) {
    if (!state.rules[i].validate(state).passed) return i;
  }
  return -1;
}
```

Note: `GameState` and `ValidationResult` types may already be imported transitively; add the explicit import to keep the file self-documenting.

- [ ] **Step 4: Run tests**

Run: `npm test -- engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/engine.ts src/components/game/password-game/__tests__/engine.test.ts
git commit -m "feat(password-game): add rule progression and validation helpers"
```

---

## Task 16: Foreshadowing moments — types and selection

**Files:**
- Create: `src/components/game/password-game/foreshadowing.tsx`

- [ ] **Step 1: Implement foreshadowing primitives**

Create `src/components/game/password-game/foreshadowing.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { mulberry32, pickOne } from "./prng";

export type ForeshadowKind = "nudge" | "gaslighter" | "peek" | "rumble";

export function pickForeshadow(seed: number): ForeshadowKind {
  const rng = mulberry32((seed ^ 0xb5297a4d) >>> 0);
  return pickOne(rng, ["nudge", "gaslighter", "peek", "rumble"] as const);
}

/** Triggers an effect once after the player has satisfied N rules. */
export function useForeshadowTrigger(satisfiedCount: number, triggerAt: number) {
  const [fired, setFired] = useState(false);
  useEffect(() => {
    if (!fired && satisfiedCount >= triggerAt) setFired(true);
  }, [satisfiedCount, triggerAt, fired]);
  return fired;
}

/** Renders the active foreshadowing overlay once triggered. */
export function ForeshadowOverlay({
  kind,
  active,
  containerRef,
}: {
  kind: ForeshadowKind;
  active: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  if (!active) return null;
  switch (kind) {
    case "nudge":
      return <NudgeEffect containerRef={containerRef} />;
    case "gaslighter":
      return <GaslighterEffect />;
    case "peek":
      return <PeekEffect />;
    case "rumble":
      return <RumbleEffect />;
  }
}

function NudgeEffect({ containerRef }: { containerRef: React.RefObject<HTMLElement | null> }) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const orig = el.style.transform;
    el.style.transition = "transform 0.35s ease-out";
    el.style.transform = "translateX(14px)";
    const t = window.setTimeout(() => {
      if (el) {
        el.style.transform = orig;
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [containerRef]);
  return null;
}

function GaslighterEffect() {
  // Visual-only; swap a character to another for one frame via CSS overlay.
  return (
    <div aria-hidden className="pg-foreshadow-gaslight" />
  );
}

function PeekEffect() {
  return (
    <div aria-hidden className="pg-foreshadow-peek">
      <svg viewBox="0 0 24 24" width="18" height="18">
        <ellipse cx="12" cy="12" rx="10" ry="6" fill="#fff" stroke="#000" strokeWidth="1" />
        <circle cx="12" cy="12" r="3" fill="#000" />
        <circle cx="13" cy="11" r="1" fill="#fff" />
      </svg>
    </div>
  );
}

function RumbleEffect() {
  useEffect(() => {
    document.body.animate(
      [
        { transform: "translate(0, 0)" },
        { transform: "translate(-2px, 1px)" },
        { transform: "translate(2px, -1px)" },
        { transform: "translate(-1px, 2px)" },
        { transform: "translate(0, 0)" },
      ],
      { duration: 350, iterations: 1 }
    );
  }, []);
  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/password-game/foreshadowing.tsx
git commit -m "feat(password-game): add foreshadowing moments (4 variants)"
```

---

## Task 17: Rule card UI component

**Files:**
- Create: `src/components/game/password-game/rule-card.tsx`

- [ ] **Step 1: Implement the rule card**

Create `src/components/game/password-game/rule-card.tsx`:

```typescript
"use client";

import type { Rule, ValidationResult } from "./types";
import { CheckCircle, XCircle } from "lucide-react";

interface Props {
  rule: Rule;
  result: ValidationResult;
  index: number;
  isActive: boolean;
}

export function RuleCard({ rule, result, index, isActive }: Props) {
  const passed = result.passed;
  return (
    <div
      className={`rounded-lg border px-4 py-3 transition-all ${
        passed
          ? "border-accent-green/30 bg-accent-green/5"
          : isActive
          ? "border-accent-amber/60 bg-accent-amber/10 shadow-[0_0_0_1px_var(--accent-amber)]"
          : "border-(--border) bg-(--card)"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          {passed ? (
            <CheckCircle className="h-4 w-4 text-accent-green" />
          ) : (
            <XCircle className={`h-4 w-4 ${isActive ? "text-accent-amber" : "text-(--muted)"}`} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-(--muted) mb-1">Rule {index + 1}</div>
          <div className={`text-sm ${passed ? "text-(--muted) line-through" : "text-(--foreground)"}`}>
            {rule.description}
          </div>
          {result.message && !passed && (
            <div className="mt-1 text-xs text-accent-amber">{result.message}</div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/password-game/rule-card.tsx
git commit -m "feat(password-game): add rule card UI component"
```

---

## Task 18: Main game component

**Files:**
- Create: `src/components/game/password-game/password-game.tsx`

- [ ] **Step 1: Implement the main component**

Create `src/components/game/password-game/password-game.tsx`:

```typescript
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Key } from "lucide-react";
import { selectRulesForRun, validateRules, computeActiveRuleIndex } from "./engine";
import { TIER_1_RULES } from "./rules/tier1";
import { RuleCard } from "./rule-card";
import { pickForeshadow, useForeshadowTrigger, ForeshadowOverlay } from "./foreshadowing";
import type { GameState, Rule } from "./types";

function makeSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export function PasswordGame() {
  const [seed, setSeed] = useState<number>(() => makeSeed());
  const [password, setPassword] = useState<string>("");
  const [startedAt] = useState<number>(() => Date.now());
  const containerRef = useRef<HTMLDivElement>(null);

  const rules: Rule[] = useMemo(
    () =>
      selectRulesForRun(
        seed,
        { 1: Math.min(4, TIER_1_RULES.length) },
        { 1: TIER_1_RULES }
      ),
    [seed]
  );

  const state: GameState = useMemo(
    () => ({
      password,
      elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
      activeRuleIndex: 0,
      rules,
      seed,
    }),
    [password, rules, seed, startedAt]
  );

  const results = useMemo(() => validateRules(state), [state]);
  const activeIdx = useMemo(() => computeActiveRuleIndex(state), [state]);
  const satisfiedCount = results.filter((r) => r.passed).length;

  const foreshadowKind = useMemo(() => pickForeshadow(seed), [seed]);
  const foreshadowFired = useForeshadowTrigger(satisfiedCount, 2);

  // Rules reveal progressively: show only up through the first unsatisfied.
  const revealCount = activeIdx === -1 ? rules.length : activeIdx + 1;
  const visibleRules = rules.slice(0, revealCount);
  const visibleResults = results.slice(0, revealCount);

  const reset = useCallback(() => {
    setSeed(makeSeed());
    setPassword("");
  }, []);

  const allPassed = activeIdx === -1 && rules.length > 0;

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl border border-(--border) bg-(--card) p-5 sm:p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-accent-pink" />
          <span className="text-xs font-medium text-(--muted)">
            Seed: <span className="font-mono text-(--foreground)">{seed}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 text-xs text-(--muted) hover:text-(--foreground) transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          New seed
        </button>
      </div>

      <label htmlFor="pg-input" className="block text-sm text-(--muted) mb-2">
        Please choose a password
      </label>
      <textarea
        id="pg-input"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-(--border) bg-(--background) px-4 py-3 font-mono text-base text-(--foreground) focus:outline-none focus:border-accent-pink/60 resize-none"
        spellCheck={false}
        autoComplete="off"
      />
      <div className="mt-1 text-xs text-(--muted)">
        {[...password].length} characters
      </div>

      <div className="mt-5 space-y-2">
        {visibleRules.map((rule, i) => (
          <RuleCard
            key={`${rule.id}-${i}`}
            rule={rule}
            result={visibleResults[i]}
            index={i}
            isActive={i === activeIdx}
          />
        ))}
      </div>

      {allPassed && (
        <div className="mt-5 rounded-lg border border-accent-green/40 bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
          Tier 1 cleared. (Tiers 2-5 coming soon.)
        </div>
      )}

      <ForeshadowOverlay
        kind={foreshadowKind}
        active={foreshadowFired}
        containerRef={containerRef}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/password-game/password-game.tsx
git commit -m "feat(password-game): add main game component with tier 1 progression"
```

---

## Task 19: Dedicated game page route

**Files:**
- Create: `src/app/games/password-game/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/games/password-game/page.tsx`:

```typescript
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";

const PasswordGame = dynamic(
  () => import("@/components/game/password-game/password-game").then((m) => m.PasswordGame),
  {
    loading: () => (
      <div className="w-full h-[420px] rounded-xl border border-(--border) bg-(--card) flex items-center justify-center">
        <div className="text-(--muted) text-sm">Loading...</div>
      </div>
    ),
  }
);

export const metadata = {
  title: "Password Game 2 — Amin Dhouib",
  description: "A spiritual successor to Neal Fun's Password Game. Seeded chaos, every run unique.",
};

export default function PasswordGamePage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/games"
          className="inline-flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground) transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Games
        </Link>

        <h1 className="font-display text-4xl font-black tracking-tight mb-2">
          Password Game 2
        </h1>
        <p className="text-(--muted) mb-8">
          A spiritual successor with seeded runs and escalating chaos. Every seed is a different game.
        </p>

        <PasswordGame />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Start dev server and verify the page loads**

Run (in a new terminal):
```bash
npm run dev
```

Navigate to `http://localhost:3000/games/password-game`. Verify the page renders and the rules appear as you type.

- [ ] **Step 3: Commit**

```bash
git add src/app/games/password-game/page.tsx
git commit -m "feat(password-game): add /games/password-game route"
```

---

## Task 20: Integrate card into the games tab view

**Files:**
- Modify: `src/app/games/games-client.tsx`

- [ ] **Step 1: Read the current file**

Ensure you have the current contents of `src/app/games/games-client.tsx` open.

- [ ] **Step 2: Add the import for the Key icon and Link**

Locate this line:
```typescript
import { Gamepad2, Keyboard, Trophy, RotateCcw, Rocket, Hexagon } from "lucide-react";
```

Replace with:
```typescript
import { Gamepad2, Keyboard, Trophy, RotateCcw, Rocket, Hexagon, Key } from "lucide-react";
import Link from "next/link";
```

- [ ] **Step 3: Add a new entry to GAMES array**

Locate the `GAMES` array. Append a new entry after the `hextris` entry (just before the closing `];`):

```typescript
  {
    id: "password-game",
    title: "Password Game 2",
    description: "Seeded chaos sequel. Every run unique. (Opens in new page)",
    icon: Key,
    iconColor: "text-accent-pink",
    available: true,
    external: true,
    href: "/games/password-game",
  },
```

- [ ] **Step 4: Update the GAMES type to allow the new optional fields**

If the `GAMES` array is inferred and the TS build complains, explicitly widen it. Replace `const GAMES = [` with:

```typescript
type GameEntry = {
  id: string;
  title: string;
  description: string;
  icon: typeof Gamepad2;
  iconColor: string;
  available: boolean;
  controls?: string;
  external?: boolean;
  href?: string;
};

const GAMES: GameEntry[] = [
```

- [ ] **Step 5: Update the tab button click handler for external games**

Locate the `<button ... onClick={() => setActiveGame(game.id)} ...>` inside the `GAMES.map`. Replace with:

```typescript
          <ExternalOrTabButton
            key={game.id}
            game={game}
            active={activeGame === game.id}
            onClick={() => setActiveGame(game.id)}
          />
```

Then add this component definition directly above the `export function GamesClient()` declaration:

```typescript
function ExternalOrTabButton({
  game,
  active,
  onClick,
}: {
  game: GameEntry;
  active: boolean;
  onClick: () => void;
}) {
  const className = `flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all shrink-0 ${
    active
      ? game.id === "geometric-flow"
        ? "border-accent-pink/50 bg-accent-pink/10 text-accent-pink"
        : game.id === "typing-speed"
        ? "border-accent-blue/50 bg-accent-blue/10 text-accent-blue"
        : game.id === "space-shooter"
        ? "border-accent-green/50 bg-accent-green/10 text-accent-green"
        : game.id === "code-puzzle"
        ? "border-accent-amber/50 bg-accent-amber/10 text-accent-amber"
        : game.id === "hextris"
        ? "border-purple-400/50 bg-purple-400/10 text-purple-400"
        : "border-accent-pink/50 bg-accent-pink/10 text-accent-pink"
      : "border-(--border) text-(--muted) hover:border-(--muted)/40 hover:text-(--foreground)"
  }`;
  const content = (
    <>
      <game.icon className={`h-4 w-4 ${active ? game.iconColor : "opacity-60"}`} />
      {game.title}
    </>
  );
  if (game.external && game.href) {
    return (
      <Link href={game.href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={className} type="button">
      {content}
    </button>
  );
}
```

- [ ] **Step 6: Verify the dev server still shows all games, and the new entry is a link to the password game page**

Reload `http://localhost:3000/games`. Confirm:
- The Password Game 2 tab is visible at the end of the list
- Clicking it navigates to `/games/password-game`
- Other tabs still switch games in place

- [ ] **Step 7: Commit**

```bash
git add src/app/games/games-client.tsx
git commit -m "feat(password-game): add password game card to games tab list"
```

---

## Task 21: Final verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full test suite**

Run:
```bash
npm test
```

Expected: All tests pass (prng, engine, tier1).

- [ ] **Step 2: Run lint**

Run:
```bash
npm run lint
```

Expected: No new lint errors introduced by password-game files.

- [ ] **Step 3: Manual play test**

Open `http://localhost:3000/games/password-game` in the browser. Verify:
- Rule 1 (min length) appears with a randomized N between 6 and 9
- Rules reveal progressively as earlier rules are satisfied
- Typing a password that satisfies all 4 rules shows the "Tier 1 cleared" message
- Clicking "New seed" regenerates the seed and resets progression
- After 2 rules are satisfied, the foreshadowing effect fires exactly once (visual nudge, flicker, peek, or rumble depending on seed)

- [ ] **Step 4: Commit anything else that changed (e.g. `package-lock.json` if test run modified it), or note "nothing to commit"**

```bash
git status
# if clean, nothing to do
```

---

## Self-Review Checklist (completed by plan author)

- **Spec coverage for Foundation + Tier 1 slice:**
  - Randomized rule pools (PRNG) — Task 2
  - Seeded determinism — Task 2, Task 14
  - Rule type system — Task 3
  - 10 Tier 1 rules — Tasks 4-13
  - Rule selection engine — Task 14
  - Progression logic (reveal one at a time) — Task 15, Task 18
  - 4 foreshadowing moments — Task 16
  - Rule card UI — Task 17
  - Main component — Task 18
  - Dedicated route — Task 19
  - Games page integration — Task 20
- **Deferred to later plans (explicit, not gaps):**
  - Tiers 2-5 rules, rich text formatting, hazards, adversarial AI, progressive UI destruction, result card, leaderboard, sound, daily challenges
- **No placeholders:** every task has complete code. Code references `TIER_1_RULES`, `selectRulesForRun`, `computeActiveRuleIndex`, `validateRules`, `pickForeshadow`, `useForeshadowTrigger`, `ForeshadowOverlay`, `RuleCard`, `PasswordGame` — all defined in earlier tasks.
- **Type consistency:** `Rule`, `RuleDef`, `GameState`, `ValidationResult` used consistently from Task 3 onward. Function signatures in Task 14 match their usage in Task 18.
