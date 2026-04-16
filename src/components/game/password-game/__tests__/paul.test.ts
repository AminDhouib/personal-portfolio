import { describe, it, expect } from "vitest";
import { mulberry32 } from "../prng";
import { paulRule } from "../hazards/paul";
import type { GameState, Rule } from "../types";

const EGG = "🥚";
const CHICKEN = "🐔";
const DEAD = "💀";

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

describe("Tier 4 — Paul the chicken rule", () => {
  it("exists and is tier 4", () => {
    expect(paulRule).toBeDefined();
    expect(paulRule.tier).toBe(4);
    expect(paulRule.id).toBe("paul");
  });

  it("description mentions Paul", () => {
    const rule = paulRule.create(mulberry32(1));
    expect(rule.description.toLowerCase()).toContain("paul");
  });

  it("passes when password contains an egg", () => {
    const rule = paulRule.create(mulberry32(1));
    const result = rule.validate(makeState(`abc${EGG}xyz`, rule));
    expect(result.passed).toBe(true);
  });

  it("passes when password contains a chicken", () => {
    const rule = paulRule.create(mulberry32(1));
    const result = rule.validate(makeState(`abc${CHICKEN}xyz`, rule));
    expect(result.passed).toBe(true);
  });

  it("fails when password is missing Paul", () => {
    const rule = paulRule.create(mulberry32(1));
    const result = rule.validate(makeState("no paul here", rule));
    expect(result.passed).toBe(false);
  });

  it("fails when Paul is dead (skull present)", () => {
    const rule = paulRule.create(mulberry32(1));
    const result = rule.validate(makeState(`abc${DEAD}xyz`, rule));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/starved/i);
  });

  it("has an onTick hook", () => {
    const rule = paulRule.create(mulberry32(1));
    expect(typeof rule.onTick).toBe("function");
  });

  it("records first sighting when egg is present", () => {
    const rule = paulRule.create(mulberry32(1));
    const state = makeState(`abc${EGG}xyz`, rule);
    const result = rule.onTick!(state, 100, null);
    expect(result).not.toBeNull();
    const ruleState = result!.ruleState as { firstSeen: number | null; hatchAt: number };
    expect(ruleState.firstSeen).not.toBeNull();
    expect(ruleState.hatchAt).toBeGreaterThan(0);
  });
});
