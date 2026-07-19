import type { Pg2RuleDef } from "../types";
import { pickN, rangeInt } from "../rng";
import { getInjectedWordleWord } from "../../../../../data/password-game/wordle";

/** Message shown when a live-feed rule has no feed and auto-passes. */
export const FREEBIE_MESSAGE = "(feed offline - freebie)";

/** Sum of the ASCII digit characters in a string. */
export function digitSumOf(password: string): number {
  let sum = 0;
  for (const ch of password) {
    if (ch >= "0" && ch <= "9") sum += ch.charCodeAt(0) - 48;
  }
  return sum;
}

/**
 * Rule 6 — the digits must sum to a seeded target in [35, 45]. The floor of 35
 * sits above the maximum digit sum any forced live payload can contribute (the
 * current-time HH:MM peaks at 24 for 19:59; a chess SAN adds at most ~8), so the
 * target is always reachable by padding at every clock time. See the solver's
 * protected-substring rebuild — a seed must never be structurally unsolvable.
 */
const digitSum: Pg2RuleDef = {
  id: "digit-sum",
  act: "act1",
  create: (rng) => {
    const target = rangeInt(rng, 35, 45);
    return {
      id: "digit-sum",
      act: "act1",
      description: `The digits in your password must sum to ${target}.`,
      payload: { target },
      validate: (password) => {
        const sum = digitSumOf(password);
        return { passed: sum === target, message: `${sum} / ${target}` };
      },
    };
  },
};

/** The twelve English month names, lowercased for case-insensitive matching. */
export const MONTHS: readonly string[] = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** Rule 7 — the password must name a month of the year. */
const includeMonth: Pg2RuleDef = {
  id: "include-month",
  act: "act1",
  create: () => ({
    id: "include-month",
    act: "act1",
    description: "Your password must include a month of the year.",
    validate: (password) => {
      const lower = password.toLowerCase();
      return { passed: MONTHS.some((m) => lower.includes(m)) };
    },
  }),
};

/**
 * Rule 8 — today's Wordle answer, from the live feed only. When the feed is
 * unset (the injected answer is null) the rule is a freebie; it never falls
 * back to a deterministic pool, unlike v1's wordleRule.
 */
const wordleToday: Pg2RuleDef = {
  id: "wordle-today",
  act: "act1",
  create: () => {
    const word = getInjectedWordleWord();
    return {
      id: "wordle-today",
      act: "act1",
      description: "Your password must include today's Wordle answer.",
      payload: { word },
      validate: (password) => {
        if (word === null) return { passed: true, message: FREEBIE_MESSAGE };
        return { passed: password.toUpperCase().includes(word) };
      },
    };
  },
};

/** The five fictional sponsors; three are seeded per run for the sponsor rule. */
export const SPONSORS: readonly string[] = [
  "Bloatware Pro",
  "Cloudz",
  "YoloVPN",
  "Grindstone",
  "SynergyOS",
];

/** Rule 9 — the password must plug one of three seeded sponsors. */
const sponsor: Pg2RuleDef = {
  id: "sponsor",
  act: "act1",
  create: (rng) => {
    const sponsors = pickN(rng, SPONSORS, 3);
    return {
      id: "sponsor",
      act: "act1",
      description: "Your password must include one of our sponsors.",
      payload: { sponsors },
      validate: (password) => {
        const lower = password.toLowerCase();
        return { passed: sponsors.some((s) => lower.includes(s.toLowerCase())) };
      },
    };
  },
};

/** Act 1 rules, in reveal order. */
export const ACT1_RULES: readonly Pg2RuleDef[] = [digitSum, includeMonth, wordleToday, sponsor];
