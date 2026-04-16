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

describe("Tier 5 — blurred input rule", () => {
  const def = TIER_5_RULES.find((r) => r.id === "blurred-input")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("passes when password contains the target phrase", () => {
    const rule = def.create(mulberry32(1));
    const target = rule.params.target as string;
    expect(rule.validate(makeState(`xx${target}yy`, rule)).passed).toBe(true);
  });
});

describe("Tier 5 — no-letter rule", () => {
  const def = TIER_5_RULES.find((r) => r.id === "no-letter")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("params include a banned letter", () => {
    const rule = def.create(mulberry32(1));
    expect(typeof rule.params.letter).toBe("string");
    expect((rule.params.letter as string).length).toBe(1);
  });

  it("fails when banned letter is present", () => {
    const rule = def.create(mulberry32(1));
    const letter = (rule.params.letter as string).toUpperCase();
    expect(rule.validate(makeState(`abc${letter}xyz`, rule)).passed).toBe(false);
  });

  it("passes when banned letter is absent", () => {
    const rule = def.create(mulberry32(1));
    const banned = rule.params.letter as string;
    const clean = "bcdfghjklm".replace(banned, "").replace(banned.toUpperCase(), "");
    expect(rule.validate(makeState(clean, rule)).passed).toBe(true);
  });
});
