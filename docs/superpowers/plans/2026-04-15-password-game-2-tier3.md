# Password Game 2: Tier 3 (Formatting Chaos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Add Tier 3 formatting-chaos rules. Replace the plain textarea with a formatting-aware input (`contentEditable` div) so rules can validate per-character properties like case pattern, word count, and bold/italic ratios. Ship 6 Tier 3 rules drawn from a pool into every run.

**Architecture:** The password is stored as a plain string for existing rules (so they keep working); an additional parallel structure tracks per-character formatting when Tier 3 rules activate. The input is a `contentEditable` div that emits the plain string and a formatting map. Rules validate against both.

**Scope simplification:** To keep this plan shippable, rules that require true rich text (per-char bold/italic/fonts/colors) are implemented with a simplified UX: the player toggles formatting via keyboard shortcut buttons that apply to the current selection or next-typed characters. No full-featured WYSIWYG editor.

---

## Scope

**Tier 3 rules in this plan:**
1. Every Nth character must be uppercase (plain text, no formatting)
2. Password must contain exactly N words (plain text)
3. Alternating letter case (e.g. uppercase, lowercase, uppercase...)
4. Bold at least N characters
5. Italic at least N characters
6. Bold and italic the same number of characters (parity check)

**Deferred:** rules needing custom fonts (wingdings), font sizes, per-character colors, superscript/subscript. Those require more sophisticated rendering and will be a follow-up plan.

---

## File Structure

**Create:**
- `src/components/game/password-game/rich-input.tsx` — contentEditable wrapper that emits plain text + formatting map
- `src/components/game/password-game/rules/tier3.ts` — 6 Tier 3 rule definitions
- `src/components/game/password-game/__tests__/tier3.test.ts`
- `src/components/game/password-game/__tests__/rich-input.test.ts`

**Modify:**
- `src/components/game/password-game/types.ts` — add `formatting` field to `GameState`
- `src/components/game/password-game/engine.ts` — include formatting in state construction (no behavior change for existing rules)
- `src/components/game/password-game/password-game.tsx` — swap textarea for RichInput, wire tier 3 into selectRulesForRun

---

## Task 1: Extend GameState with formatting

**Files:**
- Modify: `src/components/game/password-game/types.ts`

- [ ] **Step 1: Read types.ts**

- [ ] **Step 2: Add a `Formatting` type and extend `GameState`**

Find:
```typescript
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
```

Replace with:
```typescript
export interface CharFormatting {
  bold?: boolean;
  italic?: boolean;
}

export type FormattingMap = readonly CharFormatting[];

export interface GameState {
  /** Current password value. */
  password: string;
  /**
   * Parallel array of per-character formatting. Indexed by position in
   * `password`. Same length as [...password] (code-point aware).
   * Empty or shorter than password means "no formatting applied anywhere".
   */
  formatting: FormattingMap;
  /** Elapsed seconds since game start. */
  elapsedSeconds: number;
  /** Index of the currently active (unsatisfied) rule, or -1 if none. */
  activeRuleIndex: number;
  /** Ordered rules for this run. */
  rules: Rule[];
  /** Seed used for this run. */
  seed: number;
}
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `npm test -- password-game`
Expected: Some tests may fail because `makeState` in the tests doesn't include `formatting`. If they fail, that's handled in Task 2.

Expected failure mode: `Property 'formatting' is missing in type...`

- [ ] **Step 4: Commit**

```bash
git add src/components/game/password-game/types.ts
git commit -m "feat(password-game): add formatting map to GameState"
```

---

## Task 2: Update test helpers and existing state construction

**Files:**
- Modify: `src/components/game/password-game/__tests__/tier1.test.ts`
- Modify: `src/components/game/password-game/__tests__/tier2.test.ts`
- Modify: `src/components/game/password-game/password-game.tsx`

- [ ] **Step 1: Update tier1 test helper**

Find in `tier1.test.ts`:
```typescript
function makeState(password: string, rule: Rule): GameState {
  return {
    password,
    elapsedSeconds: 0,
    activeRuleIndex: 0,
    rules: [rule],
    seed: 1,
  };
}
```

Replace with:
```typescript
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
```

- [ ] **Step 2: Same for tier2 test helper**

Apply the same change to `tier2.test.ts`.

- [ ] **Step 3: Update password-game.tsx state construction**

Find the `const state: GameState = useMemo(...)` block in `password-game.tsx`. Add `formatting: [],` to the returned object.

Find:
```typescript
  const state: GameState = useMemo(
    () => ({
      password,
      elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
      activeRuleIndex: 0,
      rules,
      seed,
    }),
```

Replace with:
```typescript
  const state: GameState = useMemo(
    () => ({
      password,
      formatting: [],
      elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
      activeRuleIndex: 0,
      rules,
      seed,
    }),
```

(The formatting will be populated from the rich input in a later task.)

- [ ] **Step 4: Run tests**

Run: `npm test -- password-game`
Expected: all 89 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/__tests__/tier1.test.ts src/components/game/password-game/__tests__/tier2.test.ts src/components/game/password-game/password-game.tsx
git commit -m "feat(password-game): initialize empty formatting in existing state construction"
```

---

## Task 3: Tier 3 rule — every-nth uppercase

**Files:**
- Create: `src/components/game/password-game/rules/tier3.ts`
- Create: `src/components/game/password-game/__tests__/tier3.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/components/game/password-game/__tests__/tier3.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mulberry32 } from "../prng";
import { TIER_3_RULES } from "../rules/tier3";
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

describe("Tier 3 — every-nth-uppercase rule", () => {
  const def = TIER_3_RULES.find((r) => r.id === "every-nth-upper")!;

  it("exists and is tier 3", () => {
    expect(def).toBeDefined();
    expect(def.tier).toBe(3);
  });

  it("params n is between 2 and 4", () => {
    for (let seed = 1; seed < 50; seed++) {
      const rule = def.create(mulberry32(seed));
      const n = rule.params.n as number;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  it("passes when every nth (1-indexed) letter is uppercase", () => {
    const rule = def.create(mulberry32(1));
    const n = rule.params.n as number;
    // Build a string where letter at positions n-1, 2n-1, ... are uppercase
    let s = "";
    for (let i = 0; i < 12; i++) {
      const c = String.fromCharCode(97 + i); // a..l
      s += (i + 1) % n === 0 ? c.toUpperCase() : c;
    }
    expect(rule.validate(makeState(s, rule)).passed).toBe(true);
  });

  it("fails when the pattern is broken", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("abcdefgh", rule)).passed).toBe(false);
  });

  it("ignores non-letters (whitespace, digits, punctuation) when checking positions", () => {
    const rule = def.create(mulberry32(1));
    const n = rule.params.n as number;
    // "abC def" ignoring non-letters should have every nth letter uppercase.
    let letterIdx = 0;
    let s = "";
    for (let i = 0; i < 8; i++) {
      const c = String.fromCharCode(97 + i);
      letterIdx++;
      s += letterIdx % n === 0 ? c.toUpperCase() : c;
      if (i === 2) s += "  1";
    }
    expect(rule.validate(makeState(s, rule)).passed).toBe(true);
  });
});
```

Run — expect FAIL.

- [ ] **Step 2: Implement**

Create `src/components/game/password-game/rules/tier3.ts`:

```typescript
import type { RuleDef } from "../types";
import { rangeInt } from "../prng";

const everyNthUpper: RuleDef = {
  id: "every-nth-upper",
  tier: 3,
  create(rng) {
    const n = rangeInt(rng, 2, 4);
    return {
      id: "every-nth-upper",
      tier: 3,
      description: `Every ${nth(n)} letter of your password must be uppercase.`,
      params: { n },
      validate(state) {
        let letterIdx = 0;
        for (const ch of state.password) {
          if (!/[a-zA-Z]/.test(ch)) continue;
          letterIdx++;
          const shouldBeUpper = letterIdx % n === 0;
          const isUpper = ch === ch.toUpperCase() && ch !== ch.toLowerCase();
          if (shouldBeUpper && !isUpper) return { passed: false };
          if (!shouldBeUpper && isUpper) return { passed: false };
        }
        // Must have at least one uppercase letter at the nth position,
        // otherwise a short password like "abc" (with n=4) would pass trivially.
        return { passed: letterIdx >= n };
      },
    };
  },
};

function nth(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

export const TIER_3_RULES: readonly RuleDef[] = [everyNthUpper];
```

Run — expect PASS.

Commit:
```bash
git add src/components/game/password-game/rules/tier3.ts src/components/game/password-game/__tests__/tier3.test.ts
git commit -m "feat(password-game): add tier 3 every-nth-uppercase rule"
```

---

## Task 4: Tier 3 — word count (strict)

**Files:**
- Modify: `src/components/game/password-game/rules/tier3.ts`
- Modify: `src/components/game/password-game/__tests__/tier3.test.ts`

Tier 1 already has a `word-count` rule. Tier 3's version requires a higher count to make it genuinely harder.

- [ ] **Step 1: Add failing tests**

Append to `tier3.test.ts`:

```typescript
describe("Tier 3 — strict word count rule", () => {
  const def = TIER_3_RULES.find((r) => r.id === "word-count-strict")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("target n is 5-8 (higher than tier 1)", () => {
    for (let seed = 1; seed < 50; seed++) {
      const rule = def.create(mulberry32(seed));
      const n = rule.params.n as number;
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(8);
    }
  });

  it("passes with exact count of words", () => {
    const rule = def.create(mulberry32(1));
    const n = rule.params.n as number;
    const words = Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
    expect(rule.validate(makeState(words, rule)).passed).toBe(true);
  });
});
```

Run — FAIL.

- [ ] **Step 2: Implement**

Add to `tier3.ts`:
```typescript
const wordCountStrict: RuleDef = {
  id: "word-count-strict",
  tier: 3,
  create(rng) {
    const n = rangeInt(rng, 5, 8);
    return {
      id: "word-count-strict",
      tier: 3,
      description: `Your password must contain exactly ${n} space-separated words.`,
      params: { n },
      validate(state) {
        const words = state.password.trim().split(/\s+/).filter((w) => w.length > 0);
        return { passed: words.length === n, message: `${words.length} / ${n}` };
      },
    };
  },
};
```

Update `TIER_3_RULES` to `[everyNthUpper, wordCountStrict]`.

Commit: `feat(password-game): add tier 3 strict-word-count rule`

---

## Task 5: Tier 3 — alternating case

**Files:**
- Modify: `src/components/game/password-game/rules/tier3.ts`
- Modify: `src/components/game/password-game/__tests__/tier3.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```typescript
describe("Tier 3 — alternating case rule", () => {
  const def = TIER_3_RULES.find((r) => r.id === "alternating-case")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("passes with strict alternation (lower, upper, lower, upper...)", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("aBcDeFgH", rule)).passed).toBe(true);
  });

  it("fails with two consecutive same-case letters", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("aBCdEf", rule)).passed).toBe(false);
  });

  it("non-letters are skipped (don't reset the pattern)", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("a1B2c3D4", rule)).passed).toBe(true);
  });

  it("needs at least 4 letters", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("aB", rule)).passed).toBe(false);
  });
});
```

Run — FAIL.

- [ ] **Step 2: Implement**

Add to `tier3.ts`:
```typescript
const alternatingCase: RuleDef = {
  id: "alternating-case",
  tier: 3,
  create() {
    return {
      id: "alternating-case",
      tier: 3,
      description: "Your password's letters must strictly alternate between lowercase and uppercase (starting with lowercase).",
      params: {},
      validate(state) {
        let letters = 0;
        for (const ch of state.password) {
          if (!/[a-zA-Z]/.test(ch)) continue;
          letters++;
          const expectedLower = letters % 2 === 1;
          const isLower = ch === ch.toLowerCase() && ch !== ch.toUpperCase();
          const isUpper = ch === ch.toUpperCase() && ch !== ch.toLowerCase();
          if (expectedLower && !isLower) return { passed: false };
          if (!expectedLower && !isUpper) return { passed: false };
        }
        return { passed: letters >= 4 };
      },
    };
  },
};
```

Update array: add `alternatingCase`.

Commit: `feat(password-game): add tier 3 alternating-case rule`

---

## Task 6: Rich input component

**Files:**
- Create: `src/components/game/password-game/rich-input.tsx`
- Create: `src/components/game/password-game/__tests__/rich-input.test.ts`

- [ ] **Step 1: Write tests for the formatting logic**

Create `src/components/game/password-game/__tests__/rich-input.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { applyFormatRange, countFormatted } from "../rich-input";

describe("applyFormatRange", () => {
  it("extends a short formatting array to cover the given range", () => {
    const fmt = applyFormatRange([], 2, 5, { bold: true });
    expect(fmt.length).toBe(5);
    expect(fmt[0]).toEqual({});
    expect(fmt[1]).toEqual({});
    expect(fmt[2]).toEqual({ bold: true });
    expect(fmt[3]).toEqual({ bold: true });
    expect(fmt[4]).toEqual({ bold: true });
  });

  it("merges with existing formatting rather than replacing", () => {
    const initial = [{ italic: true }, { italic: true }, { italic: true }];
    const fmt = applyFormatRange(initial, 0, 2, { bold: true });
    expect(fmt[0]).toEqual({ italic: true, bold: true });
    expect(fmt[1]).toEqual({ italic: true, bold: true });
    expect(fmt[2]).toEqual({ italic: true });
  });

  it("toggling bold off removes the attribute", () => {
    const initial = [{ bold: true }, { bold: true }];
    const fmt = applyFormatRange(initial, 0, 2, { bold: false });
    expect(fmt[0]).toEqual({});
    expect(fmt[1]).toEqual({});
  });
});

describe("countFormatted", () => {
  it("counts characters with the given attribute", () => {
    const fmt = [{ bold: true }, { italic: true }, { bold: true, italic: true }, {}];
    expect(countFormatted(fmt, "bold")).toBe(2);
    expect(countFormatted(fmt, "italic")).toBe(2);
  });

  it("returns 0 on an empty map", () => {
    expect(countFormatted([], "bold")).toBe(0);
  });
});
```

Run — expect FAIL.

- [ ] **Step 2: Implement rich-input.tsx**

Create `src/components/game/password-game/rich-input.tsx`:

```typescript
"use client";

import { useCallback, useRef, useState } from "react";
import type { CharFormatting, FormattingMap } from "./types";
import { Bold, Italic } from "lucide-react";

export interface RichInputChangeEvent {
  value: string;
  formatting: FormattingMap;
}

interface Props {
  value: string;
  formatting: FormattingMap;
  onChange: (e: RichInputChangeEvent) => void;
  placeholder?: string;
}

export function RichInput({ value, formatting, onChange, placeholder }: Props) {
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const handleSelect = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    setSelection({ start: ta.selectionStart ?? 0, end: ta.selectionEnd ?? 0 });
  }, []);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      // If the password got longer, pad formatting with empty entries.
      // If shorter, truncate.
      const nextLen = [...next].length;
      const nextFmt = formatting.slice(0, nextLen);
      while (nextFmt.length < nextLen) nextFmt.push({});
      onChange({ value: next, formatting: nextFmt });
    },
    [formatting, onChange]
  );

  const applyAttr = useCallback(
    (attr: "bold" | "italic") => {
      const sel = selection ?? { start: 0, end: [...value].length };
      const start = Math.min(sel.start, sel.end);
      const end = Math.max(sel.start, sel.end);
      if (start === end) return;

      // Determine toggle: if every char in range already has the attribute, clear it.
      const allHave = [...Array(end - start)].every(
        (_, i) => formatting[start + i]?.[attr]
      );
      const next = applyFormatRange(formatting, start, end, {
        [attr]: allHave ? false : true,
      });
      onChange({ value, formatting: next });
    },
    [selection, value, formatting, onChange]
  );

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => applyAttr("bold")}
          className="inline-flex items-center gap-1 rounded border border-(--border) px-2 py-1 text-xs hover:bg-(--background)"
          title="Bold selection (or all)"
        >
          <Bold className="h-3.5 w-3.5" />
          Bold
        </button>
        <button
          type="button"
          onClick={() => applyAttr("italic")}
          className="inline-flex items-center gap-1 rounded border border-(--border) px-2 py-1 text-xs hover:bg-(--background)"
          title="Italic selection (or all)"
        >
          <Italic className="h-3.5 w-3.5" />
          Italic
        </button>
      </div>
      <div className="relative">
        <textarea
          ref={taRef}
          value={value}
          onChange={handleTextChange}
          onSelect={handleSelect}
          rows={3}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-lg border border-(--border) bg-(--background) px-4 py-3 font-mono text-base text-transparent caret-(--foreground) focus:outline-none focus:border-accent-pink/60 resize-none"
          style={{ color: "transparent", caretColor: "var(--foreground)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 px-4 py-3 font-mono text-base whitespace-pre-wrap break-words"
        >
          <FormattedText value={value} formatting={formatting} />
        </div>
      </div>
    </div>
  );
}

function FormattedText({ value, formatting }: { value: string; formatting: FormattingMap }) {
  const chars = [...value];
  return (
    <>
      {chars.map((ch, i) => {
        const f = formatting[i] ?? {};
        const style: React.CSSProperties = {
          fontWeight: f.bold ? 700 : 400,
          fontStyle: f.italic ? "italic" : "normal",
          color: "var(--foreground)",
        };
        return (
          <span key={i} style={style}>
            {ch}
          </span>
        );
      })}
    </>
  );
}

export function applyFormatRange(
  fmt: FormattingMap,
  start: number,
  end: number,
  attrs: Partial<CharFormatting>
): CharFormatting[] {
  const out: CharFormatting[] = [];
  const neededLen = Math.max(fmt.length, end);
  for (let i = 0; i < neededLen; i++) {
    const existing: CharFormatting = { ...(fmt[i] ?? {}) };
    if (i >= start && i < end) {
      for (const [k, v] of Object.entries(attrs) as [keyof CharFormatting, boolean | undefined][]) {
        if (v === true) existing[k] = true;
        else if (v === false) delete existing[k];
      }
    }
    out.push(existing);
  }
  return out;
}

export function countFormatted(fmt: FormattingMap, attr: keyof CharFormatting): number {
  let count = 0;
  for (const f of fmt) {
    if (f[attr]) count++;
  }
  return count;
}
```

Run — expect PASS.

Commit:
```bash
git add src/components/game/password-game/rich-input.tsx src/components/game/password-game/__tests__/rich-input.test.ts
git commit -m "feat(password-game): add RichInput with bold/italic formatting"
```

---

## Task 7: Tier 3 — bold at least N rule

**Files:**
- Modify: `src/components/game/password-game/rules/tier3.ts`
- Modify: `src/components/game/password-game/__tests__/tier3.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tier3.test.ts`:

```typescript
describe("Tier 3 — bold count rule", () => {
  const def = TIER_3_RULES.find((r) => r.id === "bold-count")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("target n is 3-6", () => {
    for (let seed = 1; seed < 50; seed++) {
      const rule = def.create(mulberry32(seed));
      const n = rule.params.n as number;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it("passes when enough chars are bold", () => {
    const rule = def.create(mulberry32(1));
    const n = rule.params.n as number;
    const state: GameState = {
      password: "xxxxxx",
      formatting: Array.from({ length: 6 }, (_, i) => (i < n ? { bold: true } : {})),
      elapsedSeconds: 0,
      activeRuleIndex: 0,
      rules: [rule],
      seed: 1,
    };
    expect(rule.validate(state).passed).toBe(true);
  });

  it("fails when not enough bold", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("hello", rule)).passed).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

Add to `tier3.ts`:
```typescript
import type { FormattingMap } from "../types";

function countFmt(fmt: FormattingMap, attr: "bold" | "italic"): number {
  let n = 0;
  for (const f of fmt) if (f[attr]) n++;
  return n;
}

const boldCount: RuleDef = {
  id: "bold-count",
  tier: 3,
  create(rng) {
    const n = rangeInt(rng, 3, 6);
    return {
      id: "bold-count",
      tier: 3,
      description: `At least ${n} characters of your password must be bold.`,
      params: { n },
      validate(state) {
        const c = countFmt(state.formatting, "bold");
        return { passed: c >= n, message: `${c} / ${n}` };
      },
    };
  },
};
```

Update array: add `boldCount`.

Commit: `feat(password-game): add tier 3 bold-count rule`

---

## Task 8: Tier 3 — italic count rule

**Files:**
- Modify: `src/components/game/password-game/rules/tier3.ts`
- Modify: `src/components/game/password-game/__tests__/tier3.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```typescript
describe("Tier 3 — italic count rule", () => {
  const def = TIER_3_RULES.find((r) => r.id === "italic-count")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("passes when enough chars are italic", () => {
    const rule = def.create(mulberry32(1));
    const n = rule.params.n as number;
    const state: GameState = {
      password: "xxxxxxxx",
      formatting: Array.from({ length: 8 }, (_, i) => (i < n ? { italic: true } : {})),
      elapsedSeconds: 0,
      activeRuleIndex: 0,
      rules: [rule],
      seed: 1,
    };
    expect(rule.validate(state).passed).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

Add to `tier3.ts`:
```typescript
const italicCount: RuleDef = {
  id: "italic-count",
  tier: 3,
  create(rng) {
    const n = rangeInt(rng, 3, 6);
    return {
      id: "italic-count",
      tier: 3,
      description: `At least ${n} characters of your password must be italic.`,
      params: { n },
      validate(state) {
        const c = countFmt(state.formatting, "italic");
        return { passed: c >= n, message: `${c} / ${n}` };
      },
    };
  },
};
```

Update array: add `italicCount`.

Commit: `feat(password-game): add tier 3 italic-count rule`

---

## Task 9: Tier 3 — bold/italic parity rule

**Files:**
- Modify: `src/components/game/password-game/rules/tier3.ts`
- Modify: `src/components/game/password-game/__tests__/tier3.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```typescript
describe("Tier 3 — bold/italic parity rule", () => {
  const def = TIER_3_RULES.find((r) => r.id === "bold-italic-parity")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("passes when bold and italic counts match (both >= 1)", () => {
    const rule = def.create(mulberry32(1));
    const state: GameState = {
      password: "xxxxxx",
      formatting: [
        { bold: true }, { bold: true }, { italic: true }, { italic: true }, {}, {},
      ],
      elapsedSeconds: 0,
      activeRuleIndex: 0,
      rules: [rule],
      seed: 1,
    };
    expect(rule.validate(state).passed).toBe(true);
  });

  it("fails when counts differ", () => {
    const rule = def.create(mulberry32(1));
    const state: GameState = {
      password: "xxx",
      formatting: [{ bold: true }, { italic: true }, { italic: true }],
      elapsedSeconds: 0,
      activeRuleIndex: 0,
      rules: [rule],
      seed: 1,
    };
    expect(rule.validate(state).passed).toBe(false);
  });

  it("fails when both are zero", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("abc", rule)).passed).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

Add to `tier3.ts`:
```typescript
const boldItalicParity: RuleDef = {
  id: "bold-italic-parity",
  tier: 3,
  create() {
    return {
      id: "bold-italic-parity",
      tier: 3,
      description: "Your password must have the same number of bold and italic characters (at least 1 of each).",
      params: {},
      validate(state) {
        const b = countFmt(state.formatting, "bold");
        const i = countFmt(state.formatting, "italic");
        return { passed: b === i && b >= 1, message: `bold ${b} / italic ${i}` };
      },
    };
  },
};
```

Update array — final order:
```typescript
export const TIER_3_RULES: readonly RuleDef[] = [
  everyNthUpper,
  wordCountStrict,
  alternatingCase,
  boldCount,
  italicCount,
  boldItalicParity,
];
```

Commit: `feat(password-game): add tier 3 bold-italic parity rule`

---

## Task 10: Wire RichInput and Tier 3 into game

**Files:**
- Modify: `src/components/game/password-game/password-game.tsx`

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Add imports**

Add:
```typescript
import { RichInput } from "./rich-input";
import { TIER_3_RULES } from "./rules/tier3";
import type { FormattingMap } from "./types";
```

- [ ] **Step 3: Add formatting state**

Find:
```typescript
  const [password, setPassword] = useState<string>("");
```

Add below it:
```typescript
  const [formatting, setFormatting] = useState<FormattingMap>([]);
```

- [ ] **Step 4: Update state construction to include formatting**

Find:
```typescript
      formatting: [],
```

Replace with:
```typescript
      formatting,
```

- [ ] **Step 5: Wire Tier 3 into rule selection**

Find:
```typescript
  const rules: Rule[] = useMemo(
    () =>
      selectRulesForRun(
        seed,
        { 1: Math.min(4, TIER_1_RULES.length), 2: Math.min(3, TIER_2_RULES.length) },
        { 1: TIER_1_RULES, 2: TIER_2_RULES }
      ),
    [seed]
  );
```

Replace with:
```typescript
  const rules: Rule[] = useMemo(
    () =>
      selectRulesForRun(
        seed,
        {
          1: Math.min(4, TIER_1_RULES.length),
          2: Math.min(3, TIER_2_RULES.length),
          3: Math.min(2, TIER_3_RULES.length),
        },
        { 1: TIER_1_RULES, 2: TIER_2_RULES, 3: TIER_3_RULES }
      ),
    [seed]
  );
```

- [ ] **Step 6: Replace textarea with RichInput**

Find the textarea block:
```typescript
      <textarea
        id="pg-input"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          if (!timerRunning && e.target.value.length > 0) setTimerRunning(true);
        }}
        rows={3}
        className="w-full rounded-lg border border-(--border) bg-(--background) px-4 py-3 font-mono text-base text-(--foreground) focus:outline-none focus:border-accent-pink/60 resize-none"
        spellCheck={false}
        autoComplete="off"
      />
```

Replace with:
```typescript
      <RichInput
        value={password}
        formatting={formatting}
        onChange={(e) => {
          setPassword(e.value);
          setFormatting(e.formatting);
          if (!timerRunning && e.value.length > 0) setTimerRunning(true);
        }}
        placeholder="Enter your password..."
      />
```

- [ ] **Step 7: Update `reset` and `startDaily` to clear formatting**

Find:
```typescript
  const reset = useCallback(() => {
    setSeed(makeSeed());
    setPassword("");
    setElapsedSeconds(0);
    setTimerRunning(false);
    setShowResult(false);
  }, []);
```

Replace with:
```typescript
  const reset = useCallback(() => {
    setSeed(makeSeed());
    setPassword("");
    setFormatting([]);
    setElapsedSeconds(0);
    setTimerRunning(false);
    setShowResult(false);
  }, []);
```

Same for `startDaily`: add `setFormatting([]);` after `setPassword("");`.

- [ ] **Step 8: Update completion banner**

Find:
```typescript
          All rules cleared in {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, "0")}!
```

That line stays the same. But update the tier coverage banner message style — no text change required here. The existing text already says "All rules cleared".

- [ ] **Step 9: Run tests**

Run: `npm test -- password-game`
Expected: all previously-passing tests + new tier3 tests + new rich-input tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/components/game/password-game/password-game.tsx
git commit -m "feat(password-game): wire RichInput and Tier 3 rules into game"
```

---

## Task 11: Verify

- [ ] **Step 1: Run all tests**
Run: `npm test -- password-game`

- [ ] **Step 2: Manual browser test**
- Visit `/games/password-game` → confirm Bold/Italic buttons appear
- Select text, click Bold, see text render in bold
- Complete rules that require bold/italic
- Watch completion modal show with formatted content

---

## Self-Review

- `FormattingMap` is added as a required field on `GameState` — all test helpers and state construction are updated in one pass (Task 2).
- Rich text approach is pragmatic: transparent textarea with overlay `<span>` formatting. No contentEditable quirks to manage.
- Tier 3 rules degrade gracefully: if no rule mentions bold/italic, the player never has to use those buttons.
- Non-letters are consistently skipped in case-checking rules so the player can add numbers/symbols without breaking letter-only patterns.
