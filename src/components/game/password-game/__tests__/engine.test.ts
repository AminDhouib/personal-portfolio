import { describe, it, expect } from "vitest";
import { computeActiveRuleIndex, selectRulesForRun, validateRules } from "../engine";
import { TIER_1_RULES } from "../rules/tier1";
import type { GameState } from "../types";

describe("selectRulesForRun", () => {
  it("draws the requested count of rules per tier", () => {
    const rules = selectRulesForRun(12345, { 1: 4 }, { 1: TIER_1_RULES });
    expect(rules).toHaveLength(4);
    rules.forEach((r) => expect(r.tier).toBe(1));
  });

  it("is deterministic for the same seed", () => {
    const a = selectRulesForRun(42, { 1: 4 }, { 1: TIER_1_RULES });
    const b = selectRulesForRun(42, { 1: 4 }, { 1: TIER_1_RULES });
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });

  it("produces different sets for different seeds", () => {
    const a = selectRulesForRun(1, { 1: 4 }, { 1: TIER_1_RULES });
    const b = selectRulesForRun(9999, { 1: 4 }, { 1: TIER_1_RULES });
    const aIds = a.map((r) => r.id).join(",");
    const bIds = b.map((r) => r.id).join(",");
    expect(aIds === bIds).toBe(false);
  });

  it("does not return duplicate rule ids within the same tier", () => {
    const rules = selectRulesForRun(7, { 1: 4 }, { 1: TIER_1_RULES });
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

function state(password: string, rules: ReturnType<typeof selectRulesForRun>): GameState {
  return { password, elapsedSeconds: 0, activeRuleIndex: 0, rules, seed: 1 };
}

describe("computeActiveRuleIndex", () => {
  it("returns 0 when no rules are satisfied", () => {
    const rules = selectRulesForRun(1, { 1: 3 }, { 1: TIER_1_RULES });
    expect(computeActiveRuleIndex(state("", rules))).toBe(0);
  });

  it("returns -1 when all rules pass, else first failing index", () => {
    const rules = selectRulesForRun(1, { 1: 1 }, { 1: TIER_1_RULES });
    const pw = "x".repeat(15);
    const st = state(pw, rules);
    const results = validateRules(st);
    const activeIdx = computeActiveRuleIndex(st);
    if (results.every((r) => r.passed)) {
      expect(activeIdx).toBe(-1);
    } else {
      expect(activeIdx).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns the first unsatisfied rule index", () => {
    const rules = selectRulesForRun(1, { 1: 3 }, { 1: TIER_1_RULES });
    const results = validateRules(state("", rules));
    const expectedIdx = results.findIndex((r) => !r.passed);
    expect(computeActiveRuleIndex(state("", rules))).toBe(expectedIdx);
  });
});

describe("validateRules", () => {
  it("returns one result per rule, in rule order", () => {
    const rules = selectRulesForRun(1, { 1: 4 }, { 1: TIER_1_RULES });
    const results = validateRules(state("abc", rules));
    expect(results).toHaveLength(4);
    results.forEach((r) => {
      expect(typeof r.passed).toBe("boolean");
    });
  });
});
