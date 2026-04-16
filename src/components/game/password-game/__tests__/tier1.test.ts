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

describe("Tier 1 — digit count rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "digit-count")!;

  it("exists", () => {
    expect(def).toBeDefined();
  });

  it("fails if too few digits", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("abc", rule)).passed).toBe(false);
  });

  it("passes when digit count matches", () => {
    const rule = def.create(mulberry32(1));
    const n = rule.params.n as number;
    const pw = "a" + "1".repeat(n);
    expect(rule.validate(makeState(pw, rule)).passed).toBe(true);
  });

  it("n is between 1 and 3", () => {
    for (let seed = 1; seed < 50; seed++) {
      const rule = def.create(mulberry32(seed));
      const n = rule.params.n as number;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
    }
  });
});

describe("Tier 1 — uppercase rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "uppercase")!;

  it("exists and is tier 1", () => {
    expect(def).toBeDefined();
    expect(def.tier).toBe(1);
  });

  it("fails without uppercase", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("abc123", rule)).passed).toBe(false);
  });

  it("passes with uppercase", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("Abc123", rule)).passed).toBe(true);
  });
});

describe("Tier 1 — special char rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "special-char")!;

  it("picks a random subset of special chars", () => {
    const rule = def.create(mulberry32(1));
    const allowed = rule.params.chars as string;
    expect(typeof allowed).toBe("string");
    expect(allowed.length).toBeGreaterThan(0);
  });

  it("fails without special char from subset", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("Abc123", rule)).passed).toBe(false);
  });

  it("passes when password contains an allowed special char", () => {
    const rule = def.create(mulberry32(1));
    const chars = rule.params.chars as string;
    const pw = "Abc" + chars[0] + "123";
    expect(rule.validate(makeState(pw, rule)).passed).toBe(true);
  });
});

describe("Tier 1 — digit sum rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "digit-sum")!;

  it("target sum is between 15 and 30", () => {
    for (let seed = 1; seed < 50; seed++) {
      const rule = def.create(mulberry32(seed));
      const target = rule.params.target as number;
      expect(target).toBeGreaterThanOrEqual(15);
      expect(target).toBeLessThanOrEqual(30);
    }
  });

  it("fails when digit sum doesn't match", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("a1b2", rule)).passed).toBe(false);
  });

  it("passes when digits sum to target", () => {
    const rule = def.create(mulberry32(1));
    const target = rule.params.target as number;
    const nines = Math.floor(target / 9);
    const remainder = target % 9;
    const pw = "A!" + "9".repeat(nines) + (remainder > 0 ? remainder.toString() : "");
    expect(rule.validate(makeState(pw, rule)).passed).toBe(true);
  });
});

describe("Tier 1 — color name rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "color-name")!;

  it("passes when password contains a color name (case-insensitive)", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("myPasswordRED!", rule)).passed).toBe(true);
  });

  it("fails without a color name", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("xyz", rule)).passed).toBe(false);
  });
});

describe("Tier 1 — day of week rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "day-of-week")!;

  it("passes with a day name (case-insensitive)", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("Abc123monday!", rule)).passed).toBe(true);
    expect(rule.validate(makeState("Abc123SUNDAY!", rule)).passed).toBe(true);
  });

  it("fails without a day name", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("Abc123!", rule)).passed).toBe(false);
  });
});

describe("Tier 1 — planet rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "planet")!;

  it("passes with Earth, Mars, etc.", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("Abc123earth!", rule)).passed).toBe(true);
  });

  it("fails without a planet name", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("xyz", rule)).passed).toBe(false);
  });
});

describe("Tier 1 — palindrome rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "palindrome")!;

  it("min length is between 3 and 5", () => {
    for (let seed = 1; seed < 50; seed++) {
      const rule = def.create(mulberry32(seed));
      const n = rule.params.n as number;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it("passes when password contains a palindrome of sufficient length", () => {
    const rule = def.create(mulberry32(1));
    const pw = "abc" + "level" + "xyz";
    expect(rule.validate(makeState(pw, rule)).passed).toBe(true);
  });

  it("fails without a palindrome", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("abcdefg", rule)).passed).toBe(false);
  });
});

describe("Tier 1 — word count rule", () => {
  const def = TIER_1_RULES.find((r) => r.id === "word-count")!;

  it("target word count is between 2 and 4", () => {
    for (let seed = 1; seed < 50; seed++) {
      const rule = def.create(mulberry32(seed));
      const n = rule.params.n as number;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  it("passes with correct word count", () => {
    const rule = def.create(mulberry32(1));
    const n = rule.params.n as number;
    const words = Array.from({ length: n }, (_, i) => `word${i + 1}`).join(" ");
    expect(rule.validate(makeState(words, rule)).passed).toBe(true);
  });

  it("fails with wrong word count", () => {
    const rule = def.create(mulberry32(1));
    expect(rule.validate(makeState("oneword", rule)).passed).toBe(false);
  });
});
