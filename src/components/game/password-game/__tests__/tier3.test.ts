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
