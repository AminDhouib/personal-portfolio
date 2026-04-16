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
