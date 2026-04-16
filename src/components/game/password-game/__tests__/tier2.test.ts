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
