import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { GameState, Pg2Rule, RuleApi } from "../types";
import { mulberry32, subSeed } from "../rng";
import { CORE_RULES } from "../rules/index";
import { FILLER, solveAll, solveRule } from "./solve";
import { CAPTCHA_PHRASE } from "../rules/prologue";
import { FREEBIE_MESSAGE, MONTHS, SPONSORS } from "../rules/act1";
import { ROMAN_PRODUCT_TARGETS } from "../rules/act2";
import { BACKWARDS_PASSWORD } from "../rules/act3";
import { fromRoman, parseRomanTokens, romanProduct, toRoman } from "../rules/roman";
import { setTodayWord } from "../../../../../data/password-game/wordle";
import { CHESS_PUZZLES, setDailyChessPuzzle } from "../../../../../data/password-game/chess";
import { setExtendedCapitals } from "../../../../../data/password-game/capitals";

/** Validators ignore GameState; a stub keeps the call sites terse. */
const S = {} as unknown as GameState;

const api = (hhmm = "12:00"): RuleApi => ({
  isEventActive: () => false,
  isEventDone: () => false,
  getEventData: () => null,
  nowHHMM: () => hhmm,
});

/** Create a rule the way the engine does: a per-rule seeded stream. */
const make = (id: string, seed = 1): Pg2Rule => {
  const def = CORE_RULES.find((d) => d.id === id);
  if (!def) throw new Error(`no such rule: ${id}`);
  return def.create(mulberry32(subSeed(seed, "rule-" + id)));
};

const passes = (rule: Pg2Rule, pw: string, a: RuleApi = api()): boolean =>
  rule.validate(pw, S, a).passed;

/** Feeds are process-global; clear them so every test starts offline. */
beforeEach(() => {
  setTodayWord(null);
  setDailyChessPuzzle(null);
  setExtendedCapitals(null);
});
afterAll(() => {
  setTodayWord(null);
  setDailyChessPuzzle(null);
  setExtendedCapitals(null);
});

describe("core rule roster", () => {
  it("lists all 17 authored rules in the fixed reveal order", () => {
    expect(CORE_RULES.map((d) => d.id)).toEqual([
      "min-length-12",
      "include-number",
      "include-uppercase",
      "include-special",
      "captcha-human",
      "digit-sum",
      "include-month",
      "wordle-today",
      "sponsor",
      "roman-numeral",
      "roman-product",
      "country-name",
      "current-time",
      "chess-best-move",
      "max-length",
      "backwards-password",
      "final-blessing",
    ]);
  });

  it("groups the rules into the five acts by position", () => {
    const acts = CORE_RULES.map((d) => d.act);
    expect(acts.slice(0, 5)).toEqual(Array(5).fill("prologue"));
    expect(acts.slice(5, 9)).toEqual(Array(4).fill("act1"));
    expect(acts.slice(9, 13)).toEqual(Array(4).fill("act2"));
    expect(acts.slice(13, 17)).toEqual(Array(4).fill("act3"));
  });

  it("interpolates seeded targets into the parameterized descriptions", () => {
    const digit = make("digit-sum");
    expect(digit.description).toBe(
      `The digits in your password must sum to ${digit.payload!["target"]}.`,
    );
    const roman = make("roman-product");
    expect(roman.description).toBe(
      `The Roman numerals in your password must multiply to ${roman.payload!["target"]}.`,
    );
    const max = make("max-length");
    expect(max.description).toBe(
      `Your password must be at most ${max.payload!["target"]} characters. This is a security measure.`,
    );
  });
});

describe("rule 1 - min-length-12", () => {
  it("fails under 12 code points and passes at 12", () => {
    const rule = make("min-length-12");
    expect(passes(rule, "abc")).toBe(false);
    expect(passes(rule, "abcdefghijkl")).toBe(true);
  });

  it("counts code points, not UTF-16 units", () => {
    const rule = make("min-length-12");
    const astral = String.fromCodePoint(0x1d400); // one code point, two UTF-16 units
    expect(passes(rule, astral.repeat(6))).toBe(false); // .length 12, but 6 code points
    expect(passes(rule, astral.repeat(12))).toBe(true);
  });

  it("solveRule pads a short password", () => {
    const rule = make("min-length-12");
    expect(passes(rule, solveRule(rule, "abc", api()))).toBe(true);
  });
});

describe("rule 2 - include-number", () => {
  it("wants a digit", () => {
    const rule = make("include-number");
    expect(passes(rule, "abc")).toBe(false);
    expect(passes(rule, "abc4")).toBe(true);
  });
  it("solveRule adds one", () => {
    const rule = make("include-number");
    expect(passes(rule, solveRule(rule, "abc", api()))).toBe(true);
  });
});

describe("rule 3 - include-uppercase", () => {
  it("wants an uppercase letter", () => {
    const rule = make("include-uppercase");
    expect(passes(rule, "abc")).toBe(false);
    expect(passes(rule, "aBc")).toBe(true);
  });
  it("solveRule adds one", () => {
    const rule = make("include-uppercase");
    expect(passes(rule, solveRule(rule, "abc", api()))).toBe(true);
  });
});

describe("rule 4 - include-special", () => {
  it("wants a non-alphanumeric, non-whitespace char", () => {
    const rule = make("include-special");
    expect(passes(rule, "abc 123")).toBe(false); // spaces do not count
    expect(passes(rule, "abc!")).toBe(true);
  });
  it("solveRule adds one", () => {
    const rule = make("include-special");
    expect(passes(rule, solveRule(rule, "abc", api()))).toBe(true);
  });
});

describe("rule 5 - captcha-human", () => {
  it("demands the exact phrase, case-sensitive", () => {
    const rule = make("captcha-human");
    expect(rule.description).toContain(CAPTCHA_PHRASE);
    expect(passes(rule, "i am human")).toBe(false); // wrong case
    expect(passes(rule, "well I am human really")).toBe(true);
  });
  it("solveRule inserts the phrase", () => {
    const rule = make("captcha-human");
    expect(passes(rule, solveRule(rule, "abc", api()))).toBe(true);
  });
});

describe("rule 6 - digit-sum", () => {
  const digitsForSum = (n: number): string =>
    "9".repeat(Math.floor(n / 9)) + (n % 9 > 0 ? String(n % 9) : "");

  it("targets a value in [35, 45] and passes only on an exact sum", () => {
    const rule = make("digit-sum");
    const target = rule.payload!["target"] as number;
    expect(target).toBeGreaterThanOrEqual(35);
    expect(target).toBeLessThanOrEqual(45);
    expect(passes(rule, digitsForSum(target))).toBe(true);
    expect(passes(rule, digitsForSum(target - 1))).toBe(false);
  });

  it("targets a sum always above the worst-case forced digits (time 19:59 + SAN 8 = 32)", () => {
    // The floor of 35 keeps the target reachable at every clock time and SAN, so
    // solveDigitSum never throws its "protected digits exceed target" guard.
    for (let seed = 1; seed <= 20; seed++) {
      expect(make("digit-sum", seed).payload!["target"] as number).toBeGreaterThan(32);
    }
    // With the worst-case protected substrings present, the block still lands.
    const rule = make("digit-sum");
    const solved = solveRule(rule, "at 19:59 play Ra8", api("19:59"), ["19:59", "Ra8"]);
    expect(passes(rule, solved)).toBe(true);
    expect(solved).toContain("19:59");
    expect(solved).toContain("Ra8");
  });

  it("reports current progress in the message", () => {
    const rule = make("digit-sum");
    const target = rule.payload!["target"] as number;
    expect(rule.validate("12", S, api()).message).toBe(`3 / ${target}`);
  });

  it("solveRule hits the target exactly, even alongside the current-time digits", () => {
    const rule = make("digit-sum");
    const solved = solveRule(rule, "noon is 12:00 today", api("12:00"));
    expect(passes(rule, solved)).toBe(true);
    expect(solved).toContain("12:00"); // the time substring is preserved
  });

  it("is deterministic for a fixed seed", () => {
    expect(make("digit-sum", 5).payload!["target"]).toBe(make("digit-sum", 5).payload!["target"]);
  });
});

describe("rule 7 - include-month", () => {
  it("wants a month name, case-insensitive", () => {
    const rule = make("include-month");
    expect(MONTHS).toContain("may");
    expect(passes(rule, "abc")).toBe(false);
    expect(passes(rule, "born in MARCH")).toBe(true);
  });
  it("solveRule adds the shortest month", () => {
    const rule = make("include-month");
    expect(passes(rule, solveRule(rule, "abc", api()))).toBe(true);
  });
});

describe("rule 8 - wordle-today", () => {
  it("is a freebie when the feed is offline", () => {
    const rule = make("wordle-today");
    const res = rule.validate("literally anything", S, api());
    expect(res.passed).toBe(true);
    expect(res.message).toBe(FREEBIE_MESSAGE);
    expect(rule.payload!["word"]).toBeNull();
  });

  it("requires the injected answer, case-insensitive, when the feed is live", () => {
    setTodayWord("FLAME");
    const rule = make("wordle-today");
    expect(rule.payload!["word"]).toBe("FLAME");
    expect(passes(rule, "abc")).toBe(false);
    expect(passes(rule, "my flame here")).toBe(true);
    expect(passes(rule, solveRule(rule, "abc", api()))).toBe(true);
  });
});

describe("rule 9 - sponsor", () => {
  it("seeds exactly three distinct sponsors from the pool", () => {
    const rule = make("sponsor");
    const sponsors = rule.payload!["sponsors"] as string[];
    expect(sponsors.length).toBe(3);
    expect(new Set(sponsors).size).toBe(3);
    expect(sponsors.every((s) => SPONSORS.includes(s))).toBe(true);
  });

  it("passes on any one seeded sponsor, case-insensitive", () => {
    const rule = make("sponsor");
    const sponsors = rule.payload!["sponsors"] as string[];
    expect(passes(rule, "brought to you by " + sponsors[0]!.toLowerCase())).toBe(true);
    expect(passes(rule, "no backers here")).toBe(false);
  });

  it("passes when a sponsor appears fully uppercased (the other case direction)", () => {
    const rule = make("sponsor");
    const sponsors = rule.payload!["sponsors"] as string[];
    expect(passes(rule, "SEEN ON " + sponsors[0]!.toUpperCase())).toBe(true);
  });

  it("solveRule plugs the shortest seeded sponsor", () => {
    const rule = make("sponsor");
    expect(passes(rule, solveRule(rule, "abc", api()))).toBe(true);
  });

  it("is deterministic for a fixed seed", () => {
    expect(make("sponsor", 9).payload!["sponsors"]).toEqual(
      make("sponsor", 9).payload!["sponsors"],
    );
  });
});

describe("rule 10 - roman-numeral", () => {
  it("wants an uppercase Roman letter", () => {
    const rule = make("roman-numeral");
    expect(passes(rule, "abc")).toBe(false);
    expect(passes(rule, "xiv")).toBe(false); // lowercase does not count
    expect(passes(rule, "XIV")).toBe(true);
  });
  it("solveRule adds one", () => {
    const rule = make("roman-numeral");
    expect(passes(rule, solveRule(rule, "abc", api()))).toBe(true);
  });
});

describe("rule 11 - roman-product", () => {
  it("targets a value reachable as a single numeral", () => {
    const rule = make("roman-product");
    expect(ROMAN_PRODUCT_TARGETS).toContain(rule.payload!["target"]);
  });

  it("passes when the Roman tokens multiply to the target", () => {
    const rule = make("roman-product");
    const target = rule.payload!["target"] as number;
    expect(passes(rule, "x" + toRoman(target) + "y")).toBe(true);
    expect(passes(rule, "abc")).toBe(false);
    expect(rule.validate("abc", S, api()).message).toBe(`0 / ${target}`);
  });

  it("solveRule reaches the product from an existing token (the captcha's I)", () => {
    const rule = make("roman-product");
    expect(passes(rule, solveRule(rule, "I am human", api()))).toBe(true);
  });

  it("is deterministic for a fixed seed", () => {
    expect(make("roman-product", 3).payload!["target"]).toBe(
      make("roman-product", 3).payload!["target"],
    );
  });
});

describe("Roman token parsing (uppercase-only, maximal runs)", () => {
  it("reads a maximal token as one numeral: XIV is 14, not X*I*V", () => {
    expect(parseRomanTokens("XIV")).toEqual(["XIV"]);
    expect(romanProduct("XIV")).toBe(14);
  });
  it("separated numerals are distinct tokens: 'X I V' multiplies to 50", () => {
    expect(parseRomanTokens("X I V")).toEqual(["X", "I", "V"]);
    expect(romanProduct("X I V")).toBe(50);
  });
  it("a garbage run still reads via v1's subtractive fromRoman: IVXLCDM is 334", () => {
    expect(parseRomanTokens("IVXLCDM")).toEqual(["IVXLCDM"]);
    expect(fromRoman("IVXLCDM")).toBe(334);
    expect(romanProduct("IVXLCDM")).toBe(334);
  });
  it("ignores lowercase so ordinary words never tokenize", () => {
    expect(parseRomanTokens("cloudz may")).toEqual([]);
    expect(romanProduct("cloudz may")).toBe(0); // no tokens -> product 0, never a target
    expect(romanProduct("XII cloudz")).toBe(12);
  });

  it("a runaway product overflows to +Infinity, never NaN and never any target", () => {
    // Many separated M tokens (each 1000) multiply past Number.MAX_VALUE. The result
    // must be a clean +Infinity so the product rule fails safe, never NaN and never
    // coincidentally equal to an authored target.
    const many = Array.from({ length: 120 }, () => "M").join(" ");
    const product = romanProduct(many);
    expect(product).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(product)).toBe(false);
    for (const target of ROMAN_PRODUCT_TARGETS) expect(product).not.toBe(target);
  });
});

describe("rule 12 - country-name", () => {
  it("is a freebie when the feed is offline", () => {
    const rule = make("country-name");
    const res = rule.validate("anything", S, api());
    expect(res.passed).toBe(true);
    expect(res.message).toBe(FREEBIE_MESSAGE);
    expect(rule.payload!["country"]).toBeNull();
  });

  it("requires the injected country name, case-insensitive, when live", () => {
    setExtendedCapitals([{ country: "Testlandia", capital: "Testville" }]);
    const rule = make("country-name");
    expect(rule.payload!["country"]).toBe("Testlandia");
    expect(passes(rule, "abc")).toBe(false);
    expect(passes(rule, "visit testlandia today")).toBe(true);
    expect(passes(rule, solveRule(rule, "abc", api()))).toBe(true);
  });

  it("is deterministic for a fixed seed and feed", () => {
    setExtendedCapitals([
      { country: "Aaa", capital: "x" },
      { country: "Bbb", capital: "y" },
      { country: "Ccc", capital: "z" },
    ]);
    expect(make("country-name", 4).payload!["country"]).toBe(
      make("country-name", 4).payload!["country"],
    );
  });
});

describe("rule 13 - current-time", () => {
  it("passes only with the current HH:MM and revalidates against a live clock", () => {
    const rule = make("current-time");
    expect(passes(rule, "at 09:41 sharp", api("09:41"))).toBe(true);
    // Same password, the minute has rolled over -> it now fails.
    expect(passes(rule, "at 09:41 sharp", api("10:00"))).toBe(false);
    expect(passes(rule, "no clock here", api("09:41"))).toBe(false);
  });
  it("solveRule injects the current time", () => {
    const rule = make("current-time");
    expect(passes(rule, solveRule(rule, "abc", api("13:37")), api("13:37"))).toBe(true);
  });
});

describe("rule 14 - chess-best-move", () => {
  it("is a freebie when the feed is offline", () => {
    const rule = make("chess-best-move");
    const res = rule.validate("anything", S, api());
    expect(res.passed).toBe(true);
    expect(res.message).toBe(FREEBIE_MESSAGE);
  });

  it("requires the exact best move when a daily puzzle is injected", () => {
    const puzzle = CHESS_PUZZLES[0]!;
    setDailyChessPuzzle(puzzle);
    const rule = make("chess-best-move");
    expect(rule.payload!["bestMove"]).toBe(puzzle.bestMove);
    expect(passes(rule, "abc")).toBe(false);
    expect(passes(rule, "play " + puzzle.bestMove + " now")).toBe(true);
    expect(passes(rule, solveRule(rule, "abc", api()))).toBe(true);
  });

  it("carries the injected puzzle deterministically", () => {
    setDailyChessPuzzle(CHESS_PUZZLES[1]!);
    expect(make("chess-best-move", 6).payload!["bestMove"]).toBe(
      make("chess-best-move", 6).payload!["bestMove"],
    );
  });
});

describe("rule 15 - max-length", () => {
  it("seeds a cap in [60, 75] and passes at the cap, fails one over", () => {
    const rule = make("max-length");
    const cap = rule.payload!["target"] as number;
    expect(cap).toBeGreaterThanOrEqual(60);
    expect(cap).toBeLessThanOrEqual(75);
    expect(passes(rule, "a".repeat(cap))).toBe(true);
    expect(passes(rule, "a".repeat(cap + 1))).toBe(false);
  });
  it("solveRule trims filler to fit the cap", () => {
    const rule = make("max-length");
    const cap = rule.payload!["target"] as number;
    const solved = solveRule(rule, "a".repeat(cap - 2) + FILLER.repeat(10), api());
    expect(passes(rule, solved)).toBe(true);
    expect([...solved].length).toBe(cap);
  });
  it("throws rather than corrupt non-filler content it cannot trim", () => {
    const rule = make("max-length");
    const cap = rule.payload!["target"] as number;
    expect(() => solveRule(rule, "a".repeat(cap + 10), api())).toThrow();
  });
});

describe("rule 16 - backwards-password", () => {
  it("wants 'password' reversed, case-insensitive", () => {
    const rule = make("backwards-password");
    expect(BACKWARDS_PASSWORD).toBe("drowssap");
    expect(passes(rule, "abc")).toBe(false);
    expect(passes(rule, "myDROWSSAPhere")).toBe(true);
  });
  it("solveRule adds it", () => {
    const rule = make("backwards-password");
    expect(passes(rule, solveRule(rule, "abc", api()))).toBe(true);
  });
});

describe("rule 17 - final-blessing", () => {
  it("always passes", () => {
    const rule = make("final-blessing");
    expect(passes(rule, "")).toBe(true);
    expect(passes(rule, "whatever you like")).toBe(true);
  });
  it("solveRule is the identity", () => {
    const rule = make("final-blessing");
    expect(solveRule(rule, "abc", api())).toBe("abc");
  });
});

describe("solveAll", () => {
  const roster = (seed: number) =>
    CORE_RULES.map((d) => d.create(mulberry32(subSeed(seed, "rule-" + d.id))));

  it("drives the full offline roster to green within the seed's max-length cap", () => {
    const rules = roster(42);
    const g = { cells: [], rules } as unknown as GameState;
    const a = api("12:00");
    const solved = solveAll(g, a);
    const cap = rules.find((r) => r.id === "max-length")!.payload!["target"] as number;
    expect(rules.every((r) => r.validate(solved, g, a).passed)).toBe(true);
    expect([...solved].length).toBeLessThanOrEqual(cap);
  });

  // The solvability guarantee, locked in CI: no seed may be structurally
  // unsolvable, even under the worst-case live feed (a long country name, a
  // digit-bearing SAN, and the clock at its maximum digit sum, 19:59).
  it("solves every seed 1..20 under worst-case live feeds, within the cap", () => {
    for (let seed = 1; seed <= 20; seed++) {
      setTodayWord("FLAME");
      setDailyChessPuzzle(CHESS_PUZZLES[0]!); // best move "Ra8" -> digit 8
      setExtendedCapitals([{ country: "Saudi Arabia", capital: "Riyadh" }]);
      const rules = roster(seed);
      const g = { cells: [], rules } as unknown as GameState;
      const a = api("19:59"); // peak HH:MM digit sum (1+9+5+9 = 24)
      const solved = solveAll(g, a);
      const cap = rules.find((r) => r.id === "max-length")!.payload!["target"] as number;
      expect(rules.every((r) => r.validate(solved, g, a).passed)).toBe(true);
      expect([...solved].length).toBeLessThanOrEqual(cap);
    }
  });
});
