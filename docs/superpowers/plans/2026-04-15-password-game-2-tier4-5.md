# Password Game 2: Tier 4 + Tier 5 (Hazards & Adversarial) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Add Tier 4 environmental hazards and Tier 5 adversarial chaos. Focus on rules implementable with the existing architecture — pure validators or CSS-based visual effects — without requiring real-time per-character state mutation. Ship ~8 new rules (4 per tier), plus a "shrinking input" CSS hazard.

**Architecture:** All rules fit the existing `RuleDef` → `Rule` → `validate(state)` model. Visual effects are CSS classes keyed off chaos level, like the destruction system. No new state machinery.

---

## Scope — Tier 4 (pragmatic)

1. **Length bomb** — password must be under N chars (shrinking target forces pruning)
2. **Contains clock** — password must include the current time (HH:MM, local, re-checked every validate call)
3. **Forbidden vowel** — a random vowel cannot appear anywhere
4. **Mystery rule** — description is partially censored; player must figure it out (we pick one of the Tier 2 rules and redact its params)

## Scope — Tier 5 (pragmatic)

1. **Mirror input** — the rendered password is reversed visually (CSS transform on the input). Plain value unchanged.
2. **Blurred input** — input is CSS-blurred; player types by feel
3. **No-letter rule** — a specific letter cannot appear anywhere
4. **Last-word constraint** — the final word must be a specific length

---

## File Structure

**Create:**
- `src/components/game/password-game/rules/tier4.ts`
- `src/components/game/password-game/rules/tier5.ts`
- `src/components/game/password-game/__tests__/tier4.test.ts`
- `src/components/game/password-game/__tests__/tier5.test.ts`

**Modify:**
- `src/components/game/password-game/password-game.tsx` — wire tiers 4 & 5 into `selectRulesForRun`, add CSS hazard classes tied to active rules
- `src/components/game/password-game/destruction.css` — add mirror/blur hazard styles

---

## Task 1: Tier 4 — length bomb rule

**Files:**
- Create: `src/components/game/password-game/rules/tier4.ts`
- Create: `src/components/game/password-game/__tests__/tier4.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/components/game/password-game/__tests__/tier4.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mulberry32 } from "../prng";
import { TIER_4_RULES } from "../rules/tier4";
import type { GameState, Rule } from "../types";

function makeState(password: string, rule: Rule): GameState {
  return {
    password,
    formatting: [],
    elapsedSeconds: 0,
    activeRuleIndex: 0,
    rules: [rule],
    seed: 1,
  };
}

describe("Tier 4 — length bomb rule", () => {
  const def = TIER_4_RULES.find((r) => r.id === "length-bomb")!;

  it("exists and is tier 4", () => {
    expect(def).toBeDefined();
    expect(def.tier).toBe(4);
  });

  it("max length is 40-60", () => {
    for (let seed = 1; seed < 50; seed++) {
      const rule = def.create(mulberry32(seed));
      const max = rule.params.max as number;
      expect(max).toBeGreaterThanOrEqual(40);
      expect(max).toBeLessThanOrEqual(60);
    }
  });

  it("passes when password is under max", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("short", rule)).passed).toBe(true);
  });

  it("fails when over max", () => {
    const rule = def.create(mulberry32(1));
    const max = rule.params.max as number;
    expect(rule.validate(makeState("x".repeat(max + 1), rule)).passed).toBe(false);
  });
});
```

Run — FAIL.

- [ ] **Step 2: Implement**

Create `src/components/game/password-game/rules/tier4.ts`:

```typescript
import type { RuleDef } from "../types";
import { rangeInt } from "../prng";

const lengthBomb: RuleDef = {
  id: "length-bomb",
  tier: 4,
  create(rng) {
    const max = rangeInt(rng, 40, 60);
    return {
      id: "length-bomb",
      tier: 4,
      description: `Your password must be no longer than ${max} characters.`,
      params: { max },
      validate(state) {
        const len = [...state.password].length;
        return { passed: len <= max, message: `${len} / ${max}` };
      },
    };
  },
};

export const TIER_4_RULES: readonly RuleDef[] = [lengthBomb];
```

Run — PASS. Commit: `feat(password-game): add tier 4 length-bomb rule`

---

## Task 2: Tier 4 — clock rule

**Files:**
- Modify: `src/components/game/password-game/rules/tier4.ts`
- Modify: `src/components/game/password-game/__tests__/tier4.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```typescript
describe("Tier 4 — clock rule", () => {
  const def = TIER_4_RULES.find((r) => r.id === "clock")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("passes when password contains HH:MM matching current local time", () => {
    const rule = def.create(mulberry32(1));
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, "0");
    const mm = now.getMinutes().toString().padStart(2, "0");
    const pw = `abc ${hh}:${mm} xyz`;
    expect(rule.validate(makeState(pw, rule)).passed).toBe(true);
  });

  it("fails without a current time", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("no time", rule)).passed).toBe(false);
  });
});
```

Run — FAIL.

- [ ] **Step 2: Implement**

Add to `rules/tier4.ts`:

```typescript
function currentTimeString(): string {
  const now = new Date();
  const hh = now.getHours().toString().padStart(2, "0");
  const mm = now.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

const clockRule: RuleDef = {
  id: "clock",
  tier: 4,
  create() {
    return {
      id: "clock",
      tier: 4,
      description: "Your password must include the current time in HH:MM format.",
      params: {},
      validate(state) {
        return { passed: state.password.includes(currentTimeString()) };
      },
    };
  },
};
```

Update array: `[lengthBomb, clockRule]`. Commit: `feat(password-game): add tier 4 clock rule`

---

## Task 3: Tier 4 — forbidden vowel

**Files:**
- Modify: `src/components/game/password-game/rules/tier4.ts`
- Modify: `src/components/game/password-game/__tests__/tier4.test.ts`

- [ ] **Step 1: Add tests**

Append:

```typescript
describe("Tier 4 — forbidden vowel rule", () => {
  const def = TIER_4_RULES.find((r) => r.id === "forbidden-vowel")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("params include a single vowel", () => {
    const rule = def.create(mulberry32(1));
    const vowel = rule.params.vowel as string;
    expect(["a", "e", "i", "o", "u"]).toContain(vowel);
  });

  it("fails when the forbidden vowel is present (case-insensitive)", () => {
    const rule = def.create(mulberry32(1));
    const v = (rule.params.vowel as string).toUpperCase();
    expect(rule.validate(makeState(`abc${v}xyz`, rule)).passed).toBe(false);
  });

  it("passes when the vowel is absent", () => {
    const rule = def.create(mulberry32(1));
    const allowedVowels = "aeiou".replace(rule.params.vowel as string, "");
    expect(rule.validate(makeState(`bcdf${allowedVowels[0]}gh`, rule)).passed).toBe(true);
  });
});
```

Run — FAIL.

- [ ] **Step 2: Implement**

Add to `rules/tier4.ts`:
```typescript
import { pickOne } from "../prng";

const VOWELS = ["a", "e", "i", "o", "u"] as const;

const forbiddenVowel: RuleDef = {
  id: "forbidden-vowel",
  tier: 4,
  create(rng) {
    const vowel = pickOne(rng, VOWELS);
    return {
      id: "forbidden-vowel",
      tier: 4,
      description: `Your password cannot contain the letter "${vowel}" (uppercase or lowercase).`,
      params: { vowel },
      validate(state) {
        const lower = state.password.toLowerCase();
        return { passed: !lower.includes(vowel) };
      },
    };
  },
};
```

Update array: add `forbiddenVowel`. Commit: `feat(password-game): add tier 4 forbidden-vowel rule`

---

## Task 4: Tier 4 — mystery rule

A rule whose description is partially redacted — the player has to infer what's required.

**Files:**
- Modify: `src/components/game/password-game/rules/tier4.ts`
- Modify: `src/components/game/password-game/__tests__/tier4.test.ts`

- [ ] **Step 1: Add tests**

Append:

```typescript
describe("Tier 4 — mystery rule", () => {
  const def = TIER_4_RULES.find((r) => r.id === "mystery")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("description contains a redacted marker", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.description).toMatch(/█|▒|\?\?\?|redacted/i);
  });

  it("passes when password contains a specific hidden number", () => {
    const rule = def.create(mulberry32(1));
    const answer = rule.params.answer as string;
    expect(rule.validate(makeState(`abc${answer}xyz`, rule)).passed).toBe(true);
  });

  it("fails without the hidden answer", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("abc", rule)).passed).toBe(false);
  });
});
```

Run — FAIL.

- [ ] **Step 2: Implement**

Add to `rules/tier4.ts`:

```typescript
const MYSTERY_ANSWERS = [
  "42",       // famous
  "3.14",     // pi
  "1337",     // leet
  "404",      // not found
  "8675309",  // song
  "2024",     // year
];

const mysteryRule: RuleDef = {
  id: "mystery",
  tier: 4,
  create(rng) {
    const answer = pickOne(rng, MYSTERY_ANSWERS);
    const hint = "█".repeat(answer.length);
    return {
      id: "mystery",
      tier: 4,
      description: `Your password must include this famously-known number: ${hint}`,
      params: { answer },
      validate(state) {
        return { passed: state.password.includes(answer) };
      },
    };
  },
};
```

Update array — final Tier 4: `[lengthBomb, clockRule, forbiddenVowel, mysteryRule]`. Commit: `feat(password-game): add tier 4 mystery rule`

---

## Task 5: Tier 5 — mirror input

**Files:**
- Create: `src/components/game/password-game/rules/tier5.ts`
- Create: `src/components/game/password-game/__tests__/tier5.test.ts`

This rule's validator is simple (always passes once triggered visually) — its purpose is the visual chaos. We make the rule passively satisfy itself when the player types any character, so the rule serves as a "chaos trigger."

Actually better — make this rule require the player to type a specific palindrome-y word while the input is mirrored. The rule validates the plain text normally.

- [ ] **Step 1: Write tests**

Create `src/components/game/password-game/__tests__/tier5.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mulberry32 } from "../prng";
import { TIER_5_RULES } from "../rules/tier5";
import type { GameState, Rule } from "../types";

function makeState(password: string, rule: Rule): GameState {
  return {
    password,
    formatting: [],
    elapsedSeconds: 0,
    activeRuleIndex: 0,
    rules: [rule],
    seed: 1,
  };
}

describe("Tier 5 — mirror input rule", () => {
  const def = TIER_5_RULES.find((r) => r.id === "mirror-input")!;

  it("exists and is tier 5", () => {
    expect(def).toBeDefined();
    expect(def.tier).toBe(5);
  });

  it("params include a target word", () => {
    const rule = def.create(mulberry32(1));
    expect(typeof rule.params.target).toBe("string");
  });

  it("passes when password contains the target word", () => {
    const rule = def.create(mulberry32(1));
    const t = rule.params.target as string;
    expect(rule.validate(makeState(`abc${t}xyz`, rule)).passed).toBe(true);
  });

  it("fails without the target", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("qqqq", rule)).passed).toBe(false);
  });
});
```

Run — FAIL.

- [ ] **Step 2: Implement**

Create `src/components/game/password-game/rules/tier5.ts`:

```typescript
import type { RuleDef } from "../types";
import { pickOne } from "../prng";

const MIRROR_WORDS = ["reflect", "mirror", "reverse", "backwards", "flipped", "invert"];

const mirrorInput: RuleDef = {
  id: "mirror-input",
  tier: 5,
  create(rng) {
    const target = pickOne(rng, MIRROR_WORDS);
    return {
      id: "mirror-input",
      tier: 5,
      description: `Look into the mirror. Type the word "${target}" anywhere in your password.`,
      params: { target },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(target) };
      },
    };
  },
};

export const TIER_5_RULES: readonly RuleDef[] = [mirrorInput];
```

Run — PASS. Commit: `feat(password-game): add tier 5 mirror-input rule`

---

## Task 6: Tier 5 — blurred input

**Files:**
- Modify: `src/components/game/password-game/rules/tier5.ts`
- Modify: `src/components/game/password-game/__tests__/tier5.test.ts`

- [ ] **Step 1: Add tests**

Append:

```typescript
describe("Tier 5 — blurred input rule", () => {
  const def = TIER_5_RULES.find((r) => r.id === "blurred-input")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("passes when password contains the target phrase", () => {
    const rule = def.create(mulberry32(1));
    const target = rule.params.target as string;
    expect(rule.validate(makeState(`xx${target}yy`, rule)).passed).toBe(true);
  });
});
```

Run — FAIL.

- [ ] **Step 2: Implement**

Add to `rules/tier5.ts`:

```typescript
const BLUR_WORDS = ["clarity", "focused", "sharpen", "vision", "crystal", "defined"];

const blurredInput: RuleDef = {
  id: "blurred-input",
  tier: 5,
  create(rng) {
    const target = pickOne(rng, BLUR_WORDS);
    return {
      id: "blurred-input",
      tier: 5,
      description: `Through the blur, spell "${target}" somewhere in your password.`,
      params: { target },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(target) };
      },
    };
  },
};
```

Update array: `[mirrorInput, blurredInput]`. Commit: `feat(password-game): add tier 5 blurred-input rule`

---

## Task 7: Tier 5 — no-letter rule

**Files:**
- Modify: `src/components/game/password-game/rules/tier5.ts`
- Modify: `src/components/game/password-game/__tests__/tier5.test.ts`

- [ ] **Step 1: Add tests**

Append:

```typescript
describe("Tier 5 — no-letter rule", () => {
  const def = TIER_5_RULES.find((r) => r.id === "no-letter")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("params include a banned letter", () => {
    const rule = def.create(mulberry32(1));
    expect(typeof rule.params.letter).toBe("string");
    expect((rule.params.letter as string).length).toBe(1);
  });

  it("fails when banned letter is present", () => {
    const rule = def.create(mulberry32(1));
    const letter = (rule.params.letter as string).toUpperCase();
    expect(rule.validate(makeState(`abc${letter}xyz`, rule)).passed).toBe(false);
  });

  it("passes when banned letter is absent", () => {
    const rule = def.create(mulberry32(1));
    const banned = rule.params.letter as string;
    const clean = "bcdfghjklm".replace(banned, "").replace(banned.toUpperCase(), "");
    expect(rule.validate(makeState(clean, rule)).passed).toBe(true);
  });
});
```

Run — FAIL.

- [ ] **Step 2: Implement**

Add to `rules/tier5.ts`:

```typescript
import { rangeInt } from "../prng";

const BAD_LETTERS = ["t", "s", "r", "n", "l", "m", "d", "p"];

const noLetter: RuleDef = {
  id: "no-letter",
  tier: 5,
  create(rng) {
    const letter = BAD_LETTERS[rangeInt(rng, 0, BAD_LETTERS.length - 1)];
    return {
      id: "no-letter",
      tier: 5,
      description: `The letter "${letter}" (upper or lower) cannot appear in your password at all.`,
      params: { letter },
      validate(state) {
        const lower = state.password.toLowerCase();
        return { passed: !lower.includes(letter) };
      },
    };
  },
};
```

Update array: add `noLetter`. Commit: `feat(password-game): add tier 5 no-letter rule`

---

## Task 8: Tier 5 — last word length

**Files:**
- Modify: `src/components/game/password-game/rules/tier5.ts`
- Modify: `src/components/game/password-game/__tests__/tier5.test.ts`

- [ ] **Step 1: Add tests**

Append:

```typescript
describe("Tier 5 — last word length rule", () => {
  const def = TIER_5_RULES.find((r) => r.id === "last-word-length")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("params include a target length 4-7", () => {
    for (let seed = 1; seed < 50; seed++) {
      const rule = def.create(mulberry32(seed));
      const n = rule.params.length as number;
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it("passes when the final word has the required length", () => {
    const rule = def.create(mulberry32(1));
    const n = rule.params.length as number;
    const last = "x".repeat(n);
    expect(rule.validate(makeState(`hello world ${last}`, rule)).passed).toBe(true);
  });

  it("fails when the final word has the wrong length", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("hello world ab", rule)).passed).toBe(false);
  });
});
```

Run — FAIL.

- [ ] **Step 2: Implement**

Add to `rules/tier5.ts`:

```typescript
const lastWordLength: RuleDef = {
  id: "last-word-length",
  tier: 5,
  create(rng) {
    const length = rangeInt(rng, 4, 7);
    return {
      id: "last-word-length",
      tier: 5,
      description: `The final word of your password must be exactly ${length} characters long.`,
      params: { length },
      validate(state) {
        const words = state.password.trim().split(/\s+/).filter((w) => w.length > 0);
        const last = words[words.length - 1];
        if (!last) return { passed: false };
        return {
          passed: [...last].length === length,
          message: last ? `${[...last].length} / ${length}` : undefined,
        };
      },
    };
  },
};
```

Update array final order:
```typescript
export const TIER_5_RULES: readonly RuleDef[] = [mirrorInput, blurredInput, noLetter, lastWordLength];
```

Commit: `feat(password-game): add tier 5 last-word-length rule`

---

## Task 9: CSS for mirror/blur hazards

**Files:**
- Modify: `src/components/game/password-game/destruction.css`

- [ ] **Step 1: Append hazard styles**

Append to `destruction.css`:

```css
/* Tier 5 rule-specific hazards. Applied by adding a data attribute to the input wrapper. */
.pg-hazard-mirror textarea,
.pg-hazard-mirror .pg-formatted-text {
  transform: scaleX(-1);
  direction: ltr;
}

.pg-hazard-blur textarea,
.pg-hazard-blur .pg-formatted-text {
  filter: blur(2px);
  transition: filter 200ms ease-out;
}

.pg-hazard-blur:focus-within textarea,
.pg-hazard-blur:focus-within .pg-formatted-text {
  filter: blur(1px);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/password-game/destruction.css
git commit -m "feat(password-game): add mirror/blur hazard styles"
```

---

## Task 10: Tag rich-input overlay for hazard targeting

**Files:**
- Modify: `src/components/game/password-game/rich-input.tsx`

The overlay span that renders formatted text needs a class for the CSS selectors.

- [ ] **Step 1: Read the file**

- [ ] **Step 2: Add class**

Find:
```typescript
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 px-4 py-3 font-mono text-base whitespace-pre-wrap break-words"
        >
```

Replace with:
```typescript
        <div
          aria-hidden
          className="pg-formatted-text pointer-events-none absolute inset-0 px-4 py-3 font-mono text-base whitespace-pre-wrap break-words"
        >
```

Commit: `feat(password-game): tag rich-input overlay for hazard targeting`

---

## Task 11: Wire tiers 4 & 5 into game + hazard class

**Files:**
- Modify: `src/components/game/password-game/password-game.tsx`

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Add imports**

Add:
```typescript
import { TIER_4_RULES } from "./rules/tier4";
import { TIER_5_RULES } from "./rules/tier5";
```

- [ ] **Step 3: Update rule selection**

Find the `selectRulesForRun` call. Change to include tiers 4 & 5:

```typescript
  const rules: Rule[] = useMemo(
    () =>
      selectRulesForRun(
        seed,
        {
          1: Math.min(4, TIER_1_RULES.length),
          2: Math.min(3, TIER_2_RULES.length),
          3: Math.min(2, TIER_3_RULES.length),
          4: Math.min(2, TIER_4_RULES.length),
          5: Math.min(2, TIER_5_RULES.length),
        },
        {
          1: TIER_1_RULES,
          2: TIER_2_RULES,
          3: TIER_3_RULES,
          4: TIER_4_RULES,
          5: TIER_5_RULES,
        }
      ),
    [seed]
  );
```

- [ ] **Step 4: Compute active hazards**

After the existing `chaosLevel` useMemo, add:

```typescript
  // Hazard classes activated by specific active rules.
  const hazardClass = useMemo(() => {
    if (activeIdx === -1) return "";
    const active = rules[activeIdx];
    if (!active) return "";
    if (active.id === "mirror-input") return "pg-hazard-mirror";
    if (active.id === "blurred-input") return "pg-hazard-blur";
    return "";
  }, [activeIdx, rules]);
```

- [ ] **Step 5: Apply hazard class to RichInput wrapper**

Find the `<RichInput ... />` element and wrap it in a div:

```typescript
      <div className={hazardClass}>
        <RichInput
          ...existing props...
        />
      </div>
```

- [ ] **Step 6: Run tests**

Run: `npm test -- password-game`
Expected: all 119+ tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/game/password-game/password-game.tsx
git commit -m "feat(password-game): wire tiers 4 & 5 rules + hazard classes"
```

---

## Task 12: Verify

- Full test suite passes
- Visit `/games/password-game`, play through a run, verify rules from tiers 4 and 5 appear
- If a mirror or blur rule is active, the input visually changes
