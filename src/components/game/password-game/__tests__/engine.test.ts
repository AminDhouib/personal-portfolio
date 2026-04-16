import { describe, it, expect } from "vitest";
import { selectRulesForRun } from "../engine";
import { TIER_1_RULES } from "../rules/tier1";

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
