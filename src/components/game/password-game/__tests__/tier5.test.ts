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
