import { describe, it, expect } from "vitest";
import { mulberry32 } from "../prng";
import { TIER_4_RULES } from "../rules/tier4";
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

describe("Tier 4 — length bomb rule", () => {
  const def = TIER_4_RULES.find((r) => r.id === "length-bomb")!;

  it("exists and is tier 4", () => {
    expect(def).toBeDefined();
    expect(def.tier).toBe(4);
  });

  it("max length is 40-60", () => {
    for (let seed = 1; seed < 50; seed++) {
      const rule = def.create(mulberry32(seed));
      const max = rule.params.max as number;
      expect(max).toBeGreaterThanOrEqual(40);
      expect(max).toBeLessThanOrEqual(60);
    }
  });

  it("passes when password is under max", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("short", rule)).passed).toBe(true);
  });

  it("fails when over max", () => {
    const rule = def.create(mulberry32(1));
    const max = rule.params.max as number;
    expect(rule.validate(makeState("x".repeat(max + 1), rule)).passed).toBe(false);
  });
});

describe("Tier 4 — clock rule", () => {
  const def = TIER_4_RULES.find((r) => r.id === "clock")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("passes when password contains HH:MM matching current local time", () => {
    const rule = def.create(mulberry32(1));
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, "0");
    const mm = now.getMinutes().toString().padStart(2, "0");
    const pw = `abc ${hh}:${mm} xyz`;
    expect(rule.validate(makeState(pw, rule)).passed).toBe(true);
  });

  it("fails without a current time", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("no time", rule)).passed).toBe(false);
  });
});
