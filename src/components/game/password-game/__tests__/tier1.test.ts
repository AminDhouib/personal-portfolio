import { describe, it, expect } from "vitest";
import { mulberry32 } from "../prng";
import { TIER_1_RULES } from "../rules/tier1";
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

describe("Tier 1 — min length rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "min-length")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("fails short passwords", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("ab", rule)).passed).toBe(false);
  });

  it("passes long enough passwords", () => {
    const rule = def.create(mulberry32(1));
    const n = rule.params.n as number;
    const long = "x".repeat(n + 2);
    expect(rule.validate(makeState(long, rule)).passed).toBe(true);
  });

  it("parameter n is between 6 and 9", () => {
    for (let seed = 1; seed < 100; seed++) {
      const rule = def.create(mulberry32(seed));
      const n = rule.params.n as number;
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(9);
    }
  });

  it("is tier 1", () => {
    expect(def.tier).toBe(1);
  });
});
