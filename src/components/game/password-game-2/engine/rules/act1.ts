import type { Pg2RuleDef } from "../types";
import type { Rng } from "../rng";
import { pickN, pickOne, rangeInt } from "../rng";
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

/**
 * The six enterprise data-sharing categories in the fake preference center. The
 * labels are STATIC copy (not seeded) — only the neighbor wiring, the initial
 * toggle state, and the passphrase vary per seed. Kept terse so each switch row
 * fits on the rule card.
 */
export const CONSENT_TOGGLES: readonly string[] = [
  "Analytics cookies",
  "Personalized ads",
  "Partner data sharing (1,400 partners)",
  "Email marketing",
  "Cross-device tracking",
  "Selling your soul (optional)",
];

/**
 * The passphrase pool for the consent wall. Every word is free of uppercase
 * Roman-numeral letters (I, V, X, L, C, D, M) and of digits, so the phrase the
 * widget types into the password is inert to the two rewriting rules: it never
 * seeds a stray token for roman-product (rule 11 — see roman.ts, which reads any
 * [IVXLCDM] run) and never shifts digit-sum (rule 6). Mirrors the captcha token's
 * collision-free alphabet; the constraint is asserted in rules.test.ts.
 */
export const CONSENT_PASSPHRASES: readonly string[] = ["OPTOUT", "REFUSE", "NOTHANKS", "BEGONE"];

/** How many backward moves seed the initial toggle vector (the scramble depth). */
const CONSENT_SCRAMBLE = 4;

/** The seeded consent-wall puzzle carried on the rule payload. */
export interface ConsentPuzzle {
  toggles: string[]; // the six category labels (static copy, copied per run)
  neighbor: number[]; // neighbor[i] !== i; the toggle that flips when i is switched off
  initial: boolean[]; // seeded starting state; true = "sharing enabled"
  passphrase: string; // revealed once every toggle is off
}

/**
 * Build the seeded consent puzzle. Draw order (fixed for determinism): the six
 * neighbor slots, then the passphrase, then the scramble.
 *
 * The move model: clicking a toggle flips it; switching one OFF FLIPS its seeded
 * neighbor (the dark pattern — decline one thing and something you already
 * declined comes back). A hard "set neighbor on" would make the all-off goal a
 * Garden-of-Eden state with no predecessor and thus unreachable, so the neighbor
 * effect is a flip in both directions. The initial vector comes from a backward
 * walk of that same move from all-off, so a forward solution always exists; the
 * BFS solvability test in rules.test.ts is the enforcing safety net.
 */
function buildConsentPuzzle(rng: Rng): ConsentPuzzle {
  const size = CONSENT_TOGGLES.length;
  // Each toggle's stubborn neighbor sits 1..5 slots ahead (mod size), so it is
  // never the toggle itself.
  const neighbor: number[] = [];
  for (let i = 0; i < size; i++) neighbor.push((i + 1 + rangeInt(rng, 0, 4)) % size);
  const passphrase = pickOne(rng, CONSENT_PASSPHRASES);
  const initial: boolean[] = [];
  for (let i = 0; i < size; i++) initial.push(false);
  for (let k = 0; k < CONSENT_SCRAMBLE; k++) {
    const i = rangeInt(rng, 0, size - 1);
    const nb = neighbor[i] ?? i;
    initial[i] = true;
    initial[nb] = !(initial[nb] ?? false);
  }
  return { toggles: [...CONSENT_TOGGLES], neighbor, initial, passphrase };
}

/**
 * Rule (act1) — the consent-preference wall. A seeded preference center whose six
 * data-sharing toggles fight back: switching one off flips a neighbor on. Turning
 * every toggle off reveals a confirmation passphrase the widget types into the
 * password; the rule is satisfied once that phrase appears. Everything the widget
 * shows and does comes from the payload, so a daily or racing seed replays it.
 */
const consentPreferences: Pg2RuleDef = {
  id: "consent-preferences",
  act: "act1",
  create: (rng) => {
    const consent = buildConsentPuzzle(rng);
    return {
      id: "consent-preferences",
      act: "act1",
      description:
        "Decline all optional data sharing in your preference center, then include the confirmation phrase.",
      payload: { consent },
      validate: (password) => ({ passed: password.includes(consent.passphrase) }),
    };
  },
};

/** Act 1 rules, in reveal order. */
export const ACT1_RULES: readonly Pg2RuleDef[] = [
  digitSum,
  includeMonth,
  wordleToday,
  sponsor,
  consentPreferences,
];
