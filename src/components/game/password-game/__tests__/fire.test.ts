import { describe, it, expect } from "vitest";
import { mulberry32 } from "../prng";
import { fireRule } from "../hazards/fire";
import type { GameState, Rule } from "../types";

const FIRE = "🔥";

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

describe("Tier 4 — fire hazard rule", () => {
  it("exists and is tier 4", () => {
    expect(fireRule).toBeDefined();
    expect(fireRule.tier).toBe(4);
    expect(fireRule.id).toBe("fire");
  });

  it("description mentions fire", () => {
    const rule = fireRule.create(mulberry32(1));
    expect(rule.description.toLowerCase()).toContain("fire");
  });

  it("params include spreadInterval and maxFires", () => {
    const rule = fireRule.create(mulberry32(1));
    expect(rule.params.spreadInterval).toBeGreaterThanOrEqual(3000);
    expect(rule.params.maxFires).toBe(3);
  });

  it("passes when there is no fire in password", () => {
    const rule = fireRule.create(mulberry32(1));
    const result = rule.validate(makeState("clean password", rule));
    expect(result.passed).toBe(true);
  });

  it("fails when fire count exceeds maxFires", () => {
    const rule = fireRule.create(mulberry32(1));
    const burnt = `abc${FIRE}${FIRE}${FIRE}${FIRE}xyz`;
    const result = rule.validate(makeState(burnt, rule));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/burned up/i);
  });

  it("fails (not yet extinguished) when one fire is active", () => {
    const rule = fireRule.create(mulberry32(1));
    const result = rule.validate(makeState(`abc${FIRE}xyz`, rule));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/active/i);
  });

  it("has an onTick hook", () => {
    const rule = fireRule.create(mulberry32(1));
    expect(typeof rule.onTick).toBe("function");
  });

  it("does not ignite when password is too short", () => {
    const rule = fireRule.create(mulberry32(1));
    const state = makeState("abc", rule);
    const result = rule.onTick!(state, 100, null);
    expect(result).toBeNull();
  });

  it("ignites when password reaches 6+ chars", () => {
    const rule = fireRule.create(mulberry32(1));
    const state = makeState("abcdef", rule);
    const result = rule.onTick!(state, 100, null);
    expect(result).not.toBeNull();
    expect(result!.password).toContain(FIRE);
  });
});
