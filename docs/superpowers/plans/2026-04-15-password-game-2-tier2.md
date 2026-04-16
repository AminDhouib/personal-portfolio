# Password Game 2: Tier 2 (Knowledge Checks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Tier 2 knowledge-check rules to Password Game 2 — 8 new rule types drawn from curated real-world datasets (NATO alphabet, periodic table, foreign languages, country capitals, hex colors, code snippets, math, Roman numerals). Wire them into the game so every run gets 4 Tier 1 + 3 Tier 2 rules.

**Architecture:** Each rule is a `RuleDef` following the Tier 1 pattern (seeded factory that builds a validator). Rule-specific display data (code snippets, color swatches) is rendered via the rule's `description` string — HTML-safe inline; no new component types needed yet. Data lives under `src/data/password-game/` as JSON consumed via static imports.

**Tech Stack:** TypeScript, Vitest, existing PRNG helpers, existing engine.

---

## Scope

**In scope (8 rules):**
- NATO phonetic alphabet
- Math equation (basic arithmetic)
- Roman numeral in a value range
- Periodic table element by atomic-number range
- Foreign-language word
- Capital city
- Hex color name (shown as description text)
- Code snippet language ID (shown as description text)

**Deferred to later plans:**
- Flag identification (needs SVG flag assets + image rendering in rule card)
- Periodic-table-group rule (needs group metadata for all 118 elements)
- Any rule that requires a visual swatch/image component (color swatch, flag image)

**Game wiring:** Update `password-game.tsx` to draw `{ 1: 4, 2: 3 }` rules per run.

---

## File Structure

**Create:**
- `src/data/password-game/nato.ts` — NATO alphabet map
- `src/data/password-game/periodic-table.ts` — all 118 elements as `{ symbol, name, atomicNumber }`
- `src/data/password-game/foreign-words.ts` — English ↔ translations pool
- `src/data/password-game/capitals.ts` — country → capital pool
- `src/data/password-game/colors.ts` — curated named-color pool
- `src/data/password-game/code-snippets.ts` — `{ language, snippet }` pool
- `src/components/game/password-game/rules/tier2.ts` — 8 new RuleDef exports + `TIER_2_RULES`
- `src/components/game/password-game/__tests__/tier2.test.ts`

**Modify:**
- `src/components/game/password-game/password-game.tsx` — add Tier 2 to `selectRulesForRun` call
- `src/components/game/password-game/rule-card.tsx` — support multi-line descriptions (pre-formatted code)

---

## Task 1: Data — NATO alphabet

**Files:**
- Create: `src/data/password-game/nato.ts`

- [ ] **Step 1: Write the file**

```typescript
// NATO phonetic alphabet (ICAO). Keys are uppercase letters; values are the
// official spelling word. Used by the "NATO phonetic" rule.
export const NATO_ALPHABET: Readonly<Record<string, string>> = Object.freeze({
  A: "Alpha",
  B: "Bravo",
  C: "Charlie",
  D: "Delta",
  E: "Echo",
  F: "Foxtrot",
  G: "Golf",
  H: "Hotel",
  I: "India",
  J: "Juliet",
  K: "Kilo",
  L: "Lima",
  M: "Mike",
  N: "November",
  O: "Oscar",
  P: "Papa",
  Q: "Quebec",
  R: "Romeo",
  S: "Sierra",
  T: "Tango",
  U: "Uniform",
  V: "Victor",
  W: "Whiskey",
  X: "Xray",
  Y: "Yankee",
  Z: "Zulu",
});

export const NATO_LETTERS: readonly string[] = Object.freeze(Object.keys(NATO_ALPHABET));
```

- [ ] **Step 2: Commit**

```bash
git add src/data/password-game/nato.ts
git commit -m "feat(password-game): add NATO phonetic alphabet data"
```

---

## Task 2: Tier 2 rule — NATO phonetic

**Files:**
- Create: `src/components/game/password-game/rules/tier2.ts`
- Create: `src/components/game/password-game/__tests__/tier2.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/game/password-game/__tests__/tier2.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mulberry32 } from "../prng";
import { TIER_2_RULES } from "../rules/tier2";
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

describe("Tier 2 — NATO phonetic rule", () => {
  const def = TIER_2_RULES.find((r) => r.id === "nato-phonetic")!;

  it("exists and is tier 2", () => {
    expect(def).toBeDefined();
    expect(def.tier).toBe(2);
  });

  it("picks a single letter and its matching NATO word", () => {
    const rule = def.create(mulberry32(1));
    expect(typeof rule.params.letter).toBe("string");
    expect(typeof rule.params.word).toBe("string");
    expect((rule.params.letter as string).length).toBe(1);
  });

  it("passes when password contains the NATO word (case-insensitive)", () => {
    const rule = def.create(mulberry32(1));
    const word = rule.params.word as string;
    expect(rule.validate(makeState(`abc${word}xyz`, rule)).passed).toBe(true);
    expect(rule.validate(makeState(`abc${word.toLowerCase()}xyz`, rule)).passed).toBe(true);
  });

  it("fails when password does not contain the NATO word", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("abc", rule)).passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tier2.test.ts`
Expected: FAIL (`rules/tier2.ts` does not exist).

- [ ] **Step 3: Implement**

Create `src/components/game/password-game/rules/tier2.ts`:

```typescript
import type { RuleDef } from "../types";
import { pickOne } from "../prng";
import { NATO_ALPHABET, NATO_LETTERS } from "../../../../data/password-game/nato";

const natoPhonetic: RuleDef = {
  id: "nato-phonetic",
  tier: 2,
  create(rng) {
    const letter = pickOne(rng, NATO_LETTERS);
    const word = NATO_ALPHABET[letter];
    return {
      id: "nato-phonetic",
      tier: 2,
      description: `Your password must include the NATO phonetic spelling for the letter "${letter}".`,
      params: { letter, word },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(word.toLowerCase()) };
      },
    };
  },
};

export const TIER_2_RULES: readonly RuleDef[] = [natoPhonetic];
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tier2.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier2.ts src/components/game/password-game/__tests__/tier2.test.ts
git commit -m "feat(password-game): add tier 2 NATO phonetic rule"
```

---

## Task 3: Tier 2 rule — math equation

**Files:**
- Modify: `src/components/game/password-game/rules/tier2.ts`
- Modify: `src/components/game/password-game/__tests__/tier2.test.ts`

- [ ] **Step 1: Add failing test**

Append to `__tests__/tier2.test.ts`:

```typescript
describe("Tier 2 — math equation rule", () => {
  const def = TIER_2_RULES.find((r) => r.id === "math-equation")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("description contains the equation and the expected answer type is a number", () => {
    const rule = def.create(mulberry32(3));
    expect(typeof rule.params.answer).toBe("number");
    expect(rule.description).toMatch(/[0-9]+\s*[+\-*]\s*[0-9]+/);
  });

  it("passes when password contains the correct answer", () => {
    const rule = def.create(mulberry32(3));
    const ans = rule.params.answer as number;
    expect(rule.validate(makeState(`start${ans}end`, rule)).passed).toBe(true);
  });

  it("fails without the correct answer (also rejects adjacent digits on either side)", () => {
    const rule = def.create(mulberry32(3));
    const ans = rule.params.answer as number;
    // A digit immediately around the answer should NOT satisfy the rule,
    // because that would make "42" satisfy a rule whose answer is "4".
    expect(rule.validate(makeState(`${ans}0`, rule)).passed).toBe(false);
    expect(rule.validate(makeState(`9${ans}`, rule)).passed).toBe(false);
    expect(rule.validate(makeState("abc", rule)).passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- tier2.test.ts`

- [ ] **Step 3: Implement**

Add to `rules/tier2.ts`:

```typescript
import { rangeInt } from "../prng";

type MathOp = "+" | "-" | "*";

function evalMath(a: number, op: MathOp, b: number): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
  }
}

const mathEquation: RuleDef = {
  id: "math-equation",
  tier: 2,
  create(rng) {
    const ops: MathOp[] = ["+", "-", "*"];
    const op = ops[Math.floor(rng() * ops.length)];
    const a = op === "*" ? rangeInt(rng, 2, 9) : rangeInt(rng, 10, 50);
    const b = op === "*" ? rangeInt(rng, 2, 9) : rangeInt(rng, 1, 20);
    const answer = evalMath(a, op, b);
    return {
      id: "math-equation",
      tier: 2,
      description: `Your password must include the answer to: ${a} ${op} ${b}`,
      params: { a, b, op, answer },
      validate(state) {
        // Match the answer as a standalone integer, not as part of a longer number.
        const pattern = new RegExp(`(?<!\\d)${answer < 0 ? "\\-?" : ""}${Math.abs(answer)}(?!\\d)`);
        // Handle negative answers: the user may write "-7" or just "7"; accept either.
        if (answer < 0) {
          const hasSigned = new RegExp(`(?<!\\d)-${Math.abs(answer)}(?!\\d)`).test(state.password);
          const hasUnsigned = new RegExp(`(?<!\\d)${Math.abs(answer)}(?!\\d)`).test(state.password);
          return { passed: hasSigned || hasUnsigned };
        }
        return { passed: pattern.test(state.password) };
      },
    };
  },
};
```

Update the export:
```typescript
export const TIER_2_RULES: readonly RuleDef[] = [natoPhonetic, mathEquation];
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- tier2.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier2.ts src/components/game/password-game/__tests__/tier2.test.ts
git commit -m "feat(password-game): add tier 2 math-equation rule"
```

---

## Task 4: Tier 2 rule — Roman numeral in range

**Files:**
- Modify: `src/components/game/password-game/rules/tier2.ts`
- Modify: `src/components/game/password-game/__tests__/tier2.test.ts`

- [ ] **Step 1: Add failing test**

Append:

```typescript
describe("Tier 2 — Roman numeral range rule", () => {
  const def = TIER_2_RULES.find((r) => r.id === "roman-range")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("params include numeric min/max bounds with min < max", () => {
    const rule = def.create(mulberry32(5));
    const min = rule.params.min as number;
    const max = rule.params.max as number;
    expect(min).toBeLessThan(max);
    expect(min).toBeGreaterThanOrEqual(1);
    expect(max).toBeLessThanOrEqual(100);
  });

  it("passes with a valid Roman numeral in the range", () => {
    const rule = def.create(mulberry32(5));
    const min = rule.params.min as number;
    const max = rule.params.max as number;
    const mid = Math.floor((min + max) / 2);
    const numeral = toRomanForTest(mid);
    expect(rule.validate(makeState(`abc${numeral}xyz`, rule)).passed).toBe(true);
  });

  it("fails with a numeral outside the range or no numeral at all", () => {
    const rule = def.create(mulberry32(5));
    expect(rule.validate(makeState("no roman here", rule)).passed).toBe(false);
  });
});

// Local helper for tests only — mirrors the Roman-numeral conversion used by the rule.
function toRomanForTest(n: number): string {
  const table: [number, string][] = [
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [v, s] of table) {
    while (n >= v) { out += s; n -= v; }
  }
  return out;
}
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- tier2.test.ts`

- [ ] **Step 3: Implement**

Add to `rules/tier2.ts`:

```typescript
const ROMAN_TABLE: readonly [number, string][] = [
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

function toRoman(n: number): string {
  let out = "";
  let rem = n;
  for (const [v, s] of ROMAN_TABLE) {
    while (rem >= v) { out += s; rem -= v; }
  }
  return out;
}

function fromRoman(s: string): number {
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const v = map[s[i]] ?? 0;
    if (v === 0) return NaN;
    if (v < prev) total -= v; else total += v;
    prev = v;
  }
  return total;
}

const romanRange: RuleDef = {
  id: "roman-range",
  tier: 2,
  create(rng) {
    // Produce a random [min, max] window of width 10-30 within [1, 100].
    const width = rangeInt(rng, 10, 30);
    const min = rangeInt(rng, 1, 100 - width);
    const max = min + width;
    return {
      id: "roman-range",
      tier: 2,
      description: `Your password must include a Roman numeral whose value is between ${min} and ${max} (inclusive).`,
      params: { min, max, toRomanExample: toRoman((min + max) >> 1) },
      validate(state) {
        // Find every maximal run of Roman numeral characters and test each.
        const matches = state.password.match(/[IVXLCDM]+/gi) ?? [];
        for (const raw of matches) {
          const upper = raw.toUpperCase();
          const value = fromRoman(upper);
          if (Number.isFinite(value) && value >= min && value <= max && toRoman(value) === upper) {
            return { passed: true };
          }
        }
        return { passed: false };
      },
    };
  },
};
```

Update export:
```typescript
export const TIER_2_RULES: readonly RuleDef[] = [natoPhonetic, mathEquation, romanRange];
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- tier2.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier2.ts src/components/game/password-game/__tests__/tier2.test.ts
git commit -m "feat(password-game): add tier 2 roman-range rule"
```

---

## Task 5: Data — periodic table

**Files:**
- Create: `src/data/password-game/periodic-table.ts`

- [ ] **Step 1: Write the file**

Periodic table data with all 118 elements (symbol, name, atomic number). The data is hard-coded rather than fetched; the content is stable.

```typescript
// All 118 elements. Sourced from the IUPAC periodic table.
// Frozen to prevent accidental mutation at runtime.
export interface Element {
  symbol: string;
  name: string;
  atomicNumber: number;
}

export const ELEMENTS: readonly Element[] = Object.freeze([
  { symbol: "H",  name: "Hydrogen",      atomicNumber: 1 },
  { symbol: "He", name: "Helium",        atomicNumber: 2 },
  { symbol: "Li", name: "Lithium",       atomicNumber: 3 },
  { symbol: "Be", name: "Beryllium",     atomicNumber: 4 },
  { symbol: "B",  name: "Boron",         atomicNumber: 5 },
  { symbol: "C",  name: "Carbon",        atomicNumber: 6 },
  { symbol: "N",  name: "Nitrogen",      atomicNumber: 7 },
  { symbol: "O",  name: "Oxygen",        atomicNumber: 8 },
  { symbol: "F",  name: "Fluorine",      atomicNumber: 9 },
  { symbol: "Ne", name: "Neon",          atomicNumber: 10 },
  { symbol: "Na", name: "Sodium",        atomicNumber: 11 },
  { symbol: "Mg", name: "Magnesium",     atomicNumber: 12 },
  { symbol: "Al", name: "Aluminium",     atomicNumber: 13 },
  { symbol: "Si", name: "Silicon",       atomicNumber: 14 },
  { symbol: "P",  name: "Phosphorus",    atomicNumber: 15 },
  { symbol: "S",  name: "Sulfur",        atomicNumber: 16 },
  { symbol: "Cl", name: "Chlorine",      atomicNumber: 17 },
  { symbol: "Ar", name: "Argon",         atomicNumber: 18 },
  { symbol: "K",  name: "Potassium",     atomicNumber: 19 },
  { symbol: "Ca", name: "Calcium",       atomicNumber: 20 },
  { symbol: "Sc", name: "Scandium",      atomicNumber: 21 },
  { symbol: "Ti", name: "Titanium",      atomicNumber: 22 },
  { symbol: "V",  name: "Vanadium",      atomicNumber: 23 },
  { symbol: "Cr", name: "Chromium",      atomicNumber: 24 },
  { symbol: "Mn", name: "Manganese",     atomicNumber: 25 },
  { symbol: "Fe", name: "Iron",          atomicNumber: 26 },
  { symbol: "Co", name: "Cobalt",        atomicNumber: 27 },
  { symbol: "Ni", name: "Nickel",        atomicNumber: 28 },
  { symbol: "Cu", name: "Copper",        atomicNumber: 29 },
  { symbol: "Zn", name: "Zinc",          atomicNumber: 30 },
  { symbol: "Ga", name: "Gallium",       atomicNumber: 31 },
  { symbol: "Ge", name: "Germanium",     atomicNumber: 32 },
  { symbol: "As", name: "Arsenic",       atomicNumber: 33 },
  { symbol: "Se", name: "Selenium",      atomicNumber: 34 },
  { symbol: "Br", name: "Bromine",       atomicNumber: 35 },
  { symbol: "Kr", name: "Krypton",       atomicNumber: 36 },
  { symbol: "Rb", name: "Rubidium",      atomicNumber: 37 },
  { symbol: "Sr", name: "Strontium",     atomicNumber: 38 },
  { symbol: "Y",  name: "Yttrium",       atomicNumber: 39 },
  { symbol: "Zr", name: "Zirconium",     atomicNumber: 40 },
  { symbol: "Nb", name: "Niobium",       atomicNumber: 41 },
  { symbol: "Mo", name: "Molybdenum",    atomicNumber: 42 },
  { symbol: "Tc", name: "Technetium",    atomicNumber: 43 },
  { symbol: "Ru", name: "Ruthenium",     atomicNumber: 44 },
  { symbol: "Rh", name: "Rhodium",       atomicNumber: 45 },
  { symbol: "Pd", name: "Palladium",     atomicNumber: 46 },
  { symbol: "Ag", name: "Silver",        atomicNumber: 47 },
  { symbol: "Cd", name: "Cadmium",       atomicNumber: 48 },
  { symbol: "In", name: "Indium",        atomicNumber: 49 },
  { symbol: "Sn", name: "Tin",           atomicNumber: 50 },
  { symbol: "Sb", name: "Antimony",      atomicNumber: 51 },
  { symbol: "Te", name: "Tellurium",     atomicNumber: 52 },
  { symbol: "I",  name: "Iodine",        atomicNumber: 53 },
  { symbol: "Xe", name: "Xenon",         atomicNumber: 54 },
  { symbol: "Cs", name: "Cesium",        atomicNumber: 55 },
  { symbol: "Ba", name: "Barium",        atomicNumber: 56 },
  { symbol: "La", name: "Lanthanum",     atomicNumber: 57 },
  { symbol: "Ce", name: "Cerium",        atomicNumber: 58 },
  { symbol: "Pr", name: "Praseodymium",  atomicNumber: 59 },
  { symbol: "Nd", name: "Neodymium",     atomicNumber: 60 },
  { symbol: "Pm", name: "Promethium",    atomicNumber: 61 },
  { symbol: "Sm", name: "Samarium",      atomicNumber: 62 },
  { symbol: "Eu", name: "Europium",      atomicNumber: 63 },
  { symbol: "Gd", name: "Gadolinium",    atomicNumber: 64 },
  { symbol: "Tb", name: "Terbium",       atomicNumber: 65 },
  { symbol: "Dy", name: "Dysprosium",    atomicNumber: 66 },
  { symbol: "Ho", name: "Holmium",       atomicNumber: 67 },
  { symbol: "Er", name: "Erbium",        atomicNumber: 68 },
  { symbol: "Tm", name: "Thulium",       atomicNumber: 69 },
  { symbol: "Yb", name: "Ytterbium",     atomicNumber: 70 },
  { symbol: "Lu", name: "Lutetium",      atomicNumber: 71 },
  { symbol: "Hf", name: "Hafnium",       atomicNumber: 72 },
  { symbol: "Ta", name: "Tantalum",      atomicNumber: 73 },
  { symbol: "W",  name: "Tungsten",      atomicNumber: 74 },
  { symbol: "Re", name: "Rhenium",       atomicNumber: 75 },
  { symbol: "Os", name: "Osmium",        atomicNumber: 76 },
  { symbol: "Ir", name: "Iridium",       atomicNumber: 77 },
  { symbol: "Pt", name: "Platinum",      atomicNumber: 78 },
  { symbol: "Au", name: "Gold",          atomicNumber: 79 },
  { symbol: "Hg", name: "Mercury",       atomicNumber: 80 },
  { symbol: "Tl", name: "Thallium",      atomicNumber: 81 },
  { symbol: "Pb", name: "Lead",          atomicNumber: 82 },
  { symbol: "Bi", name: "Bismuth",       atomicNumber: 83 },
  { symbol: "Po", name: "Polonium",      atomicNumber: 84 },
  { symbol: "At", name: "Astatine",      atomicNumber: 85 },
  { symbol: "Rn", name: "Radon",         atomicNumber: 86 },
  { symbol: "Fr", name: "Francium",      atomicNumber: 87 },
  { symbol: "Ra", name: "Radium",        atomicNumber: 88 },
  { symbol: "Ac", name: "Actinium",      atomicNumber: 89 },
  { symbol: "Th", name: "Thorium",       atomicNumber: 90 },
  { symbol: "Pa", name: "Protactinium",  atomicNumber: 91 },
  { symbol: "U",  name: "Uranium",       atomicNumber: 92 },
  { symbol: "Np", name: "Neptunium",     atomicNumber: 93 },
  { symbol: "Pu", name: "Plutonium",     atomicNumber: 94 },
  { symbol: "Am", name: "Americium",     atomicNumber: 95 },
  { symbol: "Cm", name: "Curium",        atomicNumber: 96 },
  { symbol: "Bk", name: "Berkelium",     atomicNumber: 97 },
  { symbol: "Cf", name: "Californium",   atomicNumber: 98 },
  { symbol: "Es", name: "Einsteinium",   atomicNumber: 99 },
  { symbol: "Fm", name: "Fermium",       atomicNumber: 100 },
  { symbol: "Md", name: "Mendelevium",   atomicNumber: 101 },
  { symbol: "No", name: "Nobelium",      atomicNumber: 102 },
  { symbol: "Lr", name: "Lawrencium",    atomicNumber: 103 },
  { symbol: "Rf", name: "Rutherfordium", atomicNumber: 104 },
  { symbol: "Db", name: "Dubnium",       atomicNumber: 105 },
  { symbol: "Sg", name: "Seaborgium",    atomicNumber: 106 },
  { symbol: "Bh", name: "Bohrium",       atomicNumber: 107 },
  { symbol: "Hs", name: "Hassium",       atomicNumber: 108 },
  { symbol: "Mt", name: "Meitnerium",    atomicNumber: 109 },
  { symbol: "Ds", name: "Darmstadtium",  atomicNumber: 110 },
  { symbol: "Rg", name: "Roentgenium",   atomicNumber: 111 },
  { symbol: "Cn", name: "Copernicium",   atomicNumber: 112 },
  { symbol: "Nh", name: "Nihonium",      atomicNumber: 113 },
  { symbol: "Fl", name: "Flerovium",     atomicNumber: 114 },
  { symbol: "Mc", name: "Moscovium",     atomicNumber: 115 },
  { symbol: "Lv", name: "Livermorium",   atomicNumber: 116 },
  { symbol: "Ts", name: "Tennessine",    atomicNumber: 117 },
  { symbol: "Og", name: "Oganesson",     atomicNumber: 118 },
]);
```

- [ ] **Step 2: Commit**

```bash
git add src/data/password-game/periodic-table.ts
git commit -m "feat(password-game): add periodic table data (118 elements)"
```

---

## Task 6: Tier 2 rule — periodic table element

**Files:**
- Modify: `src/components/game/password-game/rules/tier2.ts`
- Modify: `src/components/game/password-game/__tests__/tier2.test.ts`

- [ ] **Step 1: Add failing test**

Append:

```typescript
import { ELEMENTS } from "../../../../data/password-game/periodic-table";

describe("Tier 2 — periodic element rule", () => {
  const def = TIER_2_RULES.find((r) => r.id === "periodic-element")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("params include an atomic number range (min, max)", () => {
    const rule = def.create(mulberry32(11));
    const min = rule.params.min as number;
    const max = rule.params.max as number;
    expect(min).toBeLessThanOrEqual(max);
    expect(min).toBeGreaterThanOrEqual(1);
    expect(max).toBeLessThanOrEqual(118);
  });

  it("passes when password contains the symbol of an element in that range", () => {
    const rule = def.create(mulberry32(11));
    const min = rule.params.min as number;
    const max = rule.params.max as number;
    const el = ELEMENTS.find((e) => e.atomicNumber >= min && e.atomicNumber <= max)!;
    expect(rule.validate(makeState(`abc ${el.symbol} xyz`, rule)).passed).toBe(true);
  });

  it("fails without any matching element symbol", () => {
    const rule = def.create(mulberry32(11));
    // Use a padding string that deliberately avoids short element symbols.
    // "Z" is not an element symbol in the periodic table, so a password of pure Z's passes zero rules.
    expect(rule.validate(makeState("zzzzzzz", rule)).passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

Add to `rules/tier2.ts`:

```typescript
import { ELEMENTS } from "../../../../data/password-game/periodic-table";

const periodicElement: RuleDef = {
  id: "periodic-element",
  tier: 2,
  create(rng) {
    // Choose a random window of 8-15 atomic numbers within [1, 118].
    const width = rangeInt(rng, 8, 15);
    const min = rangeInt(rng, 1, 118 - width);
    const max = min + width;
    return {
      id: "periodic-element",
      tier: 2,
      description: `Your password must include the symbol of an element whose atomic number is between ${min} and ${max}.`,
      params: { min, max },
      validate(state) {
        // Scan password for each candidate symbol (case-sensitive: element symbols
        // are canonically case-sensitive, but we tolerate all-lowercase player input
        // by checking both forms).
        const candidates = ELEMENTS.filter(
          (e) => e.atomicNumber >= min && e.atomicNumber <= max
        );
        const pw = state.password;
        const pwLower = pw.toLowerCase();
        for (const el of candidates) {
          if (pw.includes(el.symbol) || pwLower.includes(el.symbol.toLowerCase())) {
            return { passed: true };
          }
        }
        return { passed: false };
      },
    };
  },
};
```

Update export:
```typescript
export const TIER_2_RULES: readonly RuleDef[] = [natoPhonetic, mathEquation, romanRange, periodicElement];
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier2.ts src/components/game/password-game/__tests__/tier2.test.ts
git commit -m "feat(password-game): add tier 2 periodic-element rule"
```

---

## Task 7: Data — foreign words

**Files:**
- Create: `src/data/password-game/foreign-words.ts`

- [ ] **Step 1: Write the file**

```typescript
export interface ForeignWord {
  english: string;
  translation: string;
  language: string;
}

// Curated pool across 5 languages. Words chosen for distinctiveness
// (player cannot satisfy multiple translations with a single string).
export const FOREIGN_WORDS: readonly ForeignWord[] = Object.freeze([
  // Spanish
  { english: "house", translation: "casa", language: "Spanish" },
  { english: "book", translation: "libro", language: "Spanish" },
  { english: "dog", translation: "perro", language: "Spanish" },
  { english: "friend", translation: "amigo", language: "Spanish" },
  // French
  { english: "house", translation: "maison", language: "French" },
  { english: "bread", translation: "pain", language: "French" },
  { english: "water", translation: "eau", language: "French" },
  { english: "cheese", translation: "fromage", language: "French" },
  // German
  { english: "apple", translation: "apfel", language: "German" },
  { english: "night", translation: "nacht", language: "German" },
  { english: "street", translation: "strasse", language: "German" },
  { english: "child", translation: "kind", language: "German" },
  // Italian
  { english: "love", translation: "amore", language: "Italian" },
  { english: "sun", translation: "sole", language: "Italian" },
  { english: "moon", translation: "luna", language: "Italian" },
  { english: "wine", translation: "vino", language: "Italian" },
  // Japanese (romaji)
  { english: "cat", translation: "neko", language: "Japanese" },
  { english: "mountain", translation: "yama", language: "Japanese" },
  { english: "flower", translation: "hana", language: "Japanese" },
  { english: "fire", translation: "hi", language: "Japanese" },
]);
```

- [ ] **Step 2: Commit**

```bash
git add src/data/password-game/foreign-words.ts
git commit -m "feat(password-game): add foreign-word pool (5 languages)"
```

---

## Task 8: Tier 2 rule — foreign word

**Files:**
- Modify: `src/components/game/password-game/rules/tier2.ts`
- Modify: `src/components/game/password-game/__tests__/tier2.test.ts`

- [ ] **Step 1: Add failing test**

Append:

```typescript
import { FOREIGN_WORDS } from "../../../../data/password-game/foreign-words";

describe("Tier 2 — foreign word rule", () => {
  const def = TIER_2_RULES.find((r) => r.id === "foreign-word")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("params reference a real entry from the pool", () => {
    const rule = def.create(mulberry32(17));
    const entry = FOREIGN_WORDS.find(
      (w) => w.translation === rule.params.translation && w.language === rule.params.language
    );
    expect(entry).toBeDefined();
  });

  it("passes when password contains the translation (case-insensitive)", () => {
    const rule = def.create(mulberry32(17));
    const tr = rule.params.translation as string;
    expect(rule.validate(makeState(`abc${tr}xyz`, rule)).passed).toBe(true);
    expect(rule.validate(makeState(`abc${tr.toUpperCase()}xyz`, rule)).passed).toBe(true);
  });

  it("fails without the translation", () => {
    const rule = def.create(mulberry32(17));
    expect(rule.validate(makeState("qqqqqqq", rule)).passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Add to `rules/tier2.ts`:

```typescript
import { FOREIGN_WORDS } from "../../../../data/password-game/foreign-words";

const foreignWord: RuleDef = {
  id: "foreign-word",
  tier: 2,
  create(rng) {
    const entry = pickOne(rng, FOREIGN_WORDS);
    return {
      id: "foreign-word",
      tier: 2,
      description: `Your password must include the ${entry.language} word for "${entry.english}".`,
      params: {
        english: entry.english,
        translation: entry.translation,
        language: entry.language,
      },
      validate(state) {
        return {
          passed: state.password.toLowerCase().includes(entry.translation.toLowerCase()),
        };
      },
    };
  },
};
```

Update export:
```typescript
export const TIER_2_RULES: readonly RuleDef[] = [natoPhonetic, mathEquation, romanRange, periodicElement, foreignWord];
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier2.ts src/components/game/password-game/__tests__/tier2.test.ts
git commit -m "feat(password-game): add tier 2 foreign-word rule"
```

---

## Task 9: Data — country capitals

**Files:**
- Create: `src/data/password-game/capitals.ts`

- [ ] **Step 1: Write the file**

```typescript
export interface CountryCapital {
  country: string;
  capital: string;
}

// ~40 countries. Capitals chosen to avoid heavy overlap with other rule pools
// (no capital shares a name with a planet, day, or common color).
export const COUNTRY_CAPITALS: readonly CountryCapital[] = Object.freeze([
  { country: "France", capital: "Paris" },
  { country: "Japan", capital: "Tokyo" },
  { country: "Egypt", capital: "Cairo" },
  { country: "Kenya", capital: "Nairobi" },
  { country: "Peru", capital: "Lima" },
  { country: "Canada", capital: "Ottawa" },
  { country: "Australia", capital: "Canberra" },
  { country: "Thailand", capital: "Bangkok" },
  { country: "Vietnam", capital: "Hanoi" },
  { country: "Greece", capital: "Athens" },
  { country: "Portugal", capital: "Lisbon" },
  { country: "Ireland", capital: "Dublin" },
  { country: "Norway", capital: "Oslo" },
  { country: "Sweden", capital: "Stockholm" },
  { country: "Finland", capital: "Helsinki" },
  { country: "Poland", capital: "Warsaw" },
  { country: "Hungary", capital: "Budapest" },
  { country: "Austria", capital: "Vienna" },
  { country: "Czechia", capital: "Prague" },
  { country: "Denmark", capital: "Copenhagen" },
  { country: "Argentina", capital: "Buenos Aires" },
  { country: "Chile", capital: "Santiago" },
  { country: "Colombia", capital: "Bogota" },
  { country: "Turkey", capital: "Ankara" },
  { country: "Israel", capital: "Jerusalem" },
  { country: "Saudi Arabia", capital: "Riyadh" },
  { country: "South Korea", capital: "Seoul" },
  { country: "Philippines", capital: "Manila" },
  { country: "Indonesia", capital: "Jakarta" },
  { country: "Malaysia", capital: "Kuala Lumpur" },
  { country: "Pakistan", capital: "Islamabad" },
  { country: "Bangladesh", capital: "Dhaka" },
  { country: "Morocco", capital: "Rabat" },
  { country: "Nigeria", capital: "Abuja" },
  { country: "Ethiopia", capital: "Addis Ababa" },
  { country: "Ghana", capital: "Accra" },
  { country: "New Zealand", capital: "Wellington" },
  { country: "Iceland", capital: "Reykjavik" },
  { country: "Croatia", capital: "Zagreb" },
  { country: "Romania", capital: "Bucharest" },
]);
```

- [ ] **Step 2: Commit**

```bash
git add src/data/password-game/capitals.ts
git commit -m "feat(password-game): add country-capital data"
```

---

## Task 10: Tier 2 rule — capital city

**Files:**
- Modify: `src/components/game/password-game/rules/tier2.ts`
- Modify: `src/components/game/password-game/__tests__/tier2.test.ts`

- [ ] **Step 1: Add failing test**

Append:

```typescript
import { COUNTRY_CAPITALS } from "../../../../data/password-game/capitals";

describe("Tier 2 — capital city rule", () => {
  const def = TIER_2_RULES.find((r) => r.id === "capital-city")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("params reference a known country and capital", () => {
    const rule = def.create(mulberry32(23));
    const entry = COUNTRY_CAPITALS.find(
      (c) => c.country === rule.params.country && c.capital === rule.params.capital
    );
    expect(entry).toBeDefined();
  });

  it("passes when password contains the capital (case-insensitive, spaces preserved)", () => {
    const rule = def.create(mulberry32(23));
    const cap = rule.params.capital as string;
    expect(rule.validate(makeState(`xx${cap}yy`, rule)).passed).toBe(true);
    expect(rule.validate(makeState(`xx${cap.toLowerCase()}yy`, rule)).passed).toBe(true);
  });

  it("fails without the capital", () => {
    const rule = def.create(mulberry32(23));
    expect(rule.validate(makeState("no capital here", rule)).passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Add to `rules/tier2.ts`:

```typescript
import { COUNTRY_CAPITALS } from "../../../../data/password-game/capitals";

const capitalCity: RuleDef = {
  id: "capital-city",
  tier: 2,
  create(rng) {
    const entry = pickOne(rng, COUNTRY_CAPITALS);
    return {
      id: "capital-city",
      tier: 2,
      description: `Your password must include the capital city of ${entry.country}.`,
      params: { country: entry.country, capital: entry.capital },
      validate(state) {
        return {
          passed: state.password.toLowerCase().includes(entry.capital.toLowerCase()),
        };
      },
    };
  },
};
```

Update export:
```typescript
export const TIER_2_RULES: readonly RuleDef[] = [natoPhonetic, mathEquation, romanRange, periodicElement, foreignWord, capitalCity];
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier2.ts src/components/game/password-game/__tests__/tier2.test.ts
git commit -m "feat(password-game): add tier 2 capital-city rule"
```

---

## Task 11: Data — hex colors

**Files:**
- Create: `src/data/password-game/colors.ts`

- [ ] **Step 1: Write the file**

```typescript
export interface NamedColor {
  name: string;
  hex: string;
}

// Curated recognizable colors. Names are single words so the match is unambiguous.
export const NAMED_COLORS: readonly NamedColor[] = Object.freeze([
  { name: "crimson", hex: "#DC143C" },
  { name: "salmon", hex: "#FA8072" },
  { name: "tomato", hex: "#FF6347" },
  { name: "orchid", hex: "#DA70D6" },
  { name: "plum", hex: "#DDA0DD" },
  { name: "khaki", hex: "#F0E68C" },
  { name: "lavender", hex: "#E6E6FA" },
  { name: "turquoise", hex: "#40E0D0" },
  { name: "aquamarine", hex: "#7FFFD4" },
  { name: "chartreuse", hex: "#7FFF00" },
  { name: "periwinkle", hex: "#CCCCFF" },
  { name: "mauve", hex: "#E0B0FF" },
  { name: "fuchsia", hex: "#FF00FF" },
  { name: "amber", hex: "#FFBF00" },
  { name: "rose", hex: "#FF007F" },
  { name: "ochre", hex: "#CC7722" },
  { name: "burgundy", hex: "#800020" },
  { name: "emerald", hex: "#50C878" },
  { name: "ruby", hex: "#E0115F" },
  { name: "sapphire", hex: "#0F52BA" },
]);
```

- [ ] **Step 2: Commit**

```bash
git add src/data/password-game/colors.ts
git commit -m "feat(password-game): add named-color data (20 entries)"
```

---

## Task 12: Tier 2 rule — hex color name

**Files:**
- Modify: `src/components/game/password-game/rules/tier2.ts`
- Modify: `src/components/game/password-game/__tests__/tier2.test.ts`

- [ ] **Step 1: Add failing test**

Append:

```typescript
import { NAMED_COLORS } from "../../../../data/password-game/colors";

describe("Tier 2 — hex color rule", () => {
  const def = TIER_2_RULES.find((r) => r.id === "hex-color")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("params reference a known named color", () => {
    const rule = def.create(mulberry32(29));
    const entry = NAMED_COLORS.find(
      (c) => c.hex === rule.params.hex && c.name === rule.params.name
    );
    expect(entry).toBeDefined();
  });

  it("passes with the name in the password (case-insensitive)", () => {
    const rule = def.create(mulberry32(29));
    const name = rule.params.name as string;
    expect(rule.validate(makeState(`abc${name}xyz`, rule)).passed).toBe(true);
  });

  it("fails without the name", () => {
    const rule = def.create(mulberry32(29));
    expect(rule.validate(makeState("12345", rule)).passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Add to `rules/tier2.ts`:

```typescript
import { NAMED_COLORS } from "../../../../data/password-game/colors";

const hexColor: RuleDef = {
  id: "hex-color",
  tier: 2,
  create(rng) {
    const entry = pickOne(rng, NAMED_COLORS);
    return {
      id: "hex-color",
      tier: 2,
      description: `Your password must include the name of the color with hex code ${entry.hex}.`,
      params: { name: entry.name, hex: entry.hex },
      validate(state) {
        return {
          passed: state.password.toLowerCase().includes(entry.name.toLowerCase()),
        };
      },
    };
  },
};
```

Update export to include `hexColor`.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier2.ts src/components/game/password-game/__tests__/tier2.test.ts
git commit -m "feat(password-game): add tier 2 hex-color rule"
```

---

## Task 13: Data — code snippets

**Files:**
- Create: `src/data/password-game/code-snippets.ts`

- [ ] **Step 1: Write the file**

```typescript
export interface CodeSnippet {
  language: string;
  snippet: string;
}

// Hand-curated distinctive idioms. Each snippet is 2-5 lines and uses
// syntax that's unambiguous about the language (e.g. `puts` for Ruby,
// `fn` + `->` for Rust, `println!` for Rust, `fmt.Println` for Go).
export const CODE_SNIPPETS: readonly CodeSnippet[] = Object.freeze([
  {
    language: "Python",
    snippet: `def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("world"))`,
  },
  {
    language: "Python",
    snippet: `squares = [x * x for x in range(10) if x % 2 == 0]`,
  },
  {
    language: "Ruby",
    snippet: `names = %w[alice bob carol]
names.each do |n|
  puts "hi #{n}"
end`,
  },
  {
    language: "JavaScript",
    snippet: `const users = await fetch("/api/users").then(r => r.json());
console.log(users.length);`,
  },
  {
    language: "TypeScript",
    snippet: `type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}`,
  },
  {
    language: "Rust",
    snippet: `fn add(a: i32, b: i32) -> i32 {
    a + b
}

println!("{}", add(2, 3));`,
  },
  {
    language: "Go",
    snippet: `package main

import "fmt"

func main() {
    fmt.Println("hello")
}`,
  },
  {
    language: "Java",
    snippet: `public class Main {
    public static void main(String[] args) {
        System.out.println("hello");
    }
}`,
  },
  {
    language: "C",
    snippet: `#include <stdio.h>

int main(void) {
    printf("hello\\n");
    return 0;
}`,
  },
  {
    language: "Swift",
    snippet: `let greeting = "hello"
print(greeting.uppercased())`,
  },
]);
```

- [ ] **Step 2: Commit**

```bash
git add src/data/password-game/code-snippets.ts
git commit -m "feat(password-game): add code-snippet data (10 languages)"
```

---

## Task 14: Tier 2 rule — code snippet language

**Files:**
- Modify: `src/components/game/password-game/rules/tier2.ts`
- Modify: `src/components/game/password-game/__tests__/tier2.test.ts`

The rule's description embeds the code snippet as a pre-formatted block (multi-line). Rendering is handled by updating `RuleCard` in a later task.

- [ ] **Step 1: Add failing test**

Append:

```typescript
import { CODE_SNIPPETS } from "../../../../data/password-game/code-snippets";

describe("Tier 2 — code snippet rule", () => {
  const def = TIER_2_RULES.find((r) => r.id === "code-snippet")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("params reference a real snippet and language from the pool", () => {
    const rule = def.create(mulberry32(31));
    const entry = CODE_SNIPPETS.find(
      (s) => s.language === rule.params.language && s.snippet === rule.params.snippet
    );
    expect(entry).toBeDefined();
  });

  it("passes when password contains the language name (case-insensitive)", () => {
    const rule = def.create(mulberry32(31));
    const lang = rule.params.language as string;
    expect(rule.validate(makeState(`abc${lang}xyz`, rule)).passed).toBe(true);
    expect(rule.validate(makeState(`abc${lang.toLowerCase()}xyz`, rule)).passed).toBe(true);
  });

  it("fails without the language name", () => {
    const rule = def.create(mulberry32(31));
    expect(rule.validate(makeState("abc123", rule)).passed).toBe(false);
  });

  it("description starts with a prompt and includes the snippet", () => {
    const rule = def.create(mulberry32(31));
    const snippet = rule.params.snippet as string;
    expect(rule.description).toContain("language");
    expect(rule.description).toContain(snippet);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Add to `rules/tier2.ts`:

```typescript
import { CODE_SNIPPETS } from "../../../../data/password-game/code-snippets";

const codeSnippet: RuleDef = {
  id: "code-snippet",
  tier: 2,
  create(rng) {
    const entry = pickOne(rng, CODE_SNIPPETS);
    return {
      id: "code-snippet",
      tier: 2,
      description: `Your password must name the language of this snippet:\n\n${entry.snippet}`,
      params: { language: entry.language, snippet: entry.snippet },
      validate(state) {
        return {
          passed: state.password.toLowerCase().includes(entry.language.toLowerCase()),
        };
      },
    };
  },
};
```

Update export to include `codeSnippet`. Final array order:
```typescript
export const TIER_2_RULES: readonly RuleDef[] = [
  natoPhonetic,
  mathEquation,
  romanRange,
  periodicElement,
  foreignWord,
  capitalCity,
  hexColor,
  codeSnippet,
];
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/rules/tier2.ts src/components/game/password-game/__tests__/tier2.test.ts
git commit -m "feat(password-game): add tier 2 code-snippet rule"
```

---

## Task 15: Rule card — multi-line description support

**Files:**
- Modify: `src/components/game/password-game/rule-card.tsx`

The code-snippet rule embeds a multi-line pre-formatted block (e.g. Python code) in its description. The current `RuleCard` renders the description as a single `<div>` with no whitespace handling. Update it to preserve newlines and monospace the snippet portion.

- [ ] **Step 1: Read the current file**

Read `src/components/game/password-game/rule-card.tsx` to confirm structure.

- [ ] **Step 2: Update to handle multi-line**

Replace the body of the `<div>` that renders `{rule.description}` with a component-internal helper that splits on the first double-newline and, if a pre-formatted block exists, renders it in a `<pre>` element.

Find this line:
```typescript
          <div className={`text-sm ${passed ? "text-(--muted) line-through" : "text-(--foreground)"}`}>
            {rule.description}
          </div>
```

Replace with:
```typescript
          <div className={`text-sm ${passed ? "text-(--muted) line-through" : "text-(--foreground)"}`}>
            <RuleDescription text={rule.description} />
          </div>
```

Then add this helper at the bottom of the file (outside the `RuleCard` component):

```typescript
function RuleDescription({ text }: { text: string }) {
  const idx = text.indexOf("\n\n");
  if (idx === -1) {
    return <span>{text}</span>;
  }
  const prose = text.slice(0, idx);
  const code = text.slice(idx + 2);
  return (
    <>
      <span>{prose}</span>
      <pre className="mt-2 rounded-md bg-(--background) border border-(--border) p-3 text-xs font-mono overflow-x-auto whitespace-pre text-(--foreground)">
        {code}
      </pre>
    </>
  );
}
```

- [ ] **Step 3: Run full test suite to ensure no regressions**

Run: `npm test -- password-game`
Expected: All tier1, tier2, engine, prng tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/password-game/rule-card.tsx
git commit -m "feat(password-game): support multi-line descriptions (code snippets)"
```

---

## Task 16: Wire Tier 2 into the game component

**Files:**
- Modify: `src/components/game/password-game/password-game.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/game/password-game/password-game.tsx` to locate the `selectRulesForRun` call.

- [ ] **Step 2: Update imports**

Find this import block:
```typescript
import { TIER_1_RULES } from "./rules/tier1";
```

Replace with:
```typescript
import { TIER_1_RULES } from "./rules/tier1";
import { TIER_2_RULES } from "./rules/tier2";
```

- [ ] **Step 3: Update `selectRulesForRun` call**

Find:
```typescript
  const rules: Rule[] = useMemo(
    () =>
      selectRulesForRun(
        seed,
        { 1: Math.min(4, TIER_1_RULES.length) },
        { 1: TIER_1_RULES }
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
        { 1: Math.min(4, TIER_1_RULES.length), 2: Math.min(3, TIER_2_RULES.length) },
        { 1: TIER_1_RULES, 2: TIER_2_RULES }
      ),
    [seed]
  );
```

- [ ] **Step 4: Update the completion banner**

Find:
```typescript
      {allPassed && (
        <div className="mt-5 rounded-lg border border-accent-green/40 bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
          Tier 1 cleared. (Tiers 2-5 coming soon.)
        </div>
      )}
```

Replace with:
```typescript
      {allPassed && (
        <div className="mt-5 rounded-lg border border-accent-green/40 bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
          Tiers 1-2 cleared. (Tiers 3-5 coming soon.)
        </div>
      )}
```

- [ ] **Step 5: Run test suite**

Run: `npm test -- password-game`

Run: `npm run lint`

Both expected to pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/game/password-game/password-game.tsx
git commit -m "feat(password-game): include tier 2 rules in every run (4 tier-1 + 3 tier-2)"
```

---

## Task 17: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: all password-game tests pass (tier1 30, tier2 ~25, engine 8, prng 9 — roughly 72 tests in password-game test files). Unrelated pre-existing failures in CopilotKit widget test may still show — ignore those.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new lint errors in password-game files.

- [ ] **Step 3: Manual browser test**

With the dev server running (`npm run dev`), visit `http://localhost:3000/games/password-game`:

- Type a password satisfying the first 4 rules — confirm a tier 2 rule reveals.
- Observe at least one tier 2 rule type (NATO, math, Roman, periodic, foreign word, capital, hex color, or code snippet).
- For the code-snippet rule, confirm the snippet renders in a monospace block.
- Click "New seed" — confirm the rule set changes.
- Satisfy all 7 rules — confirm the completion banner reads "Tiers 1-2 cleared."

---

## Self-Review Checklist (plan author)

**Spec coverage for Tier 2 slice:**
- NATO phonetic — Task 2
- Math equation — Task 3
- Roman numeral in range — Task 4
- Periodic element by atomic number — Task 6
- Foreign word — Task 8
- Capital city — Task 10
- Hex color name — Task 12
- Code snippet language ID — Task 14
- Game wiring — Task 16
- Multi-line rule card support — Task 15

**Deferred (stated explicitly):**
- Flag identification, periodic-group-based element rule, visual swatch/image components.

**No placeholders:** each task contains complete code. Every symbol referenced (`natoPhonetic`, `mathEquation`, `romanRange`, `periodicElement`, `foreignWord`, `capitalCity`, `hexColor`, `codeSnippet`, `ELEMENTS`, `NATO_ALPHABET`, `FOREIGN_WORDS`, `COUNTRY_CAPITALS`, `NAMED_COLORS`, `CODE_SNIPPETS`, `RuleDescription`) is defined in a task.

**Type consistency:** `RuleDef`, `Rule`, `GameState`, `ValidationResult` used as defined in Tier 1 foundation.

**Import paths:** Data files live at `src/data/password-game/*`. From `src/components/game/password-game/rules/tier2.ts`, the import is `../../../../data/password-game/<file>` (4 levels up). This is verified against the existing tier1 code structure.
