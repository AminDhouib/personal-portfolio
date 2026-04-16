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
    expect(rule.validate(makeState(`${ans}0`, rule)).passed).toBe(false);
    expect(rule.validate(makeState(`9${ans}`, rule)).passed).toBe(false);
    expect(rule.validate(makeState("abc", rule)).passed).toBe(false);
  });
});

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
    expect(rule.validate(makeState(`123${numeral}456`, rule)).passed).toBe(true);
  });

  it("fails with a numeral outside the range or no numeral at all", () => {
    const rule = def.create(mulberry32(5));
    expect(rule.validate(makeState("no roman here", rule)).passed).toBe(false);
  });
});

function toRomanForTest(n: number): string {
  const table: [number, string][] = [
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let rem = n;
  for (const [v, s] of table) {
    while (rem >= v) { out += s; rem -= v; }
  }
  return out;
}
