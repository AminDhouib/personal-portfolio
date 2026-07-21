import type { Pg2RuleDef } from "../types";
import type { Rng } from "../rng";
import { pickN, pickOne, rangeInt } from "../rng";

/** The three tile kinds a captcha grid draws from. */
export type CaptchaKind = "traffic-light" | "crosswalk" | "storefront";
export const CAPTCHA_KINDS: readonly CaptchaKind[] = ["traffic-light", "crosswalk", "storefront"];

/** One captcha tile. */
export interface CaptchaTile {
  kind: CaptchaKind;
}

/** A 3x3 grid — always nine tiles, in row-major order. */
export type CaptchaGrid = CaptchaTile[];

/**
 * The seeded captcha challenge carried on the rule payload. Both grids, the target
 * kind, and the confirmation token derive from the rule's create(rng) stream, so a
 * daily or racing seed replays the exact same challenge. The widget rejects the
 * first correct answer (the dark-pattern gag) and yields `token` on the second; the
 * validator passes once `token` appears in the password.
 */
export interface CaptchaChallenge {
  grids: [CaptchaGrid, CaptchaGrid];
  target: CaptchaKind;
  token: string;
}

/** The nine tile positions of a 3x3 grid. */
const CAPTCHA_POSITIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * The token's four symbols are drawn from a collision-free hex subset — no decimal
 * digit and no Roman-numeral letter. That keeps the token inert to the two solver
 * rules that rewrite the password: digit-sum never strips a token symbol (none are
 * digits, so its tight seeded target stays reachable) and roman-product never reads
 * a stray numeral out of it. So every seed stays solvable with no widening of either
 * rule, and the token still matches the /^OK-[0-9A-F]{4}$/ shape the widget and the
 * validator agree on.
 */
const TOKEN_ALPHABET = ["A", "B", "E", "F"] as const;

/** Build one 3x3 grid holding 3-5 target tiles, the rest distractors. */
function buildCaptchaGrid(rng: Rng, target: CaptchaKind): CaptchaGrid {
  const targetCount = rangeInt(rng, 3, 5);
  const targetPositions = new Set(pickN(rng, CAPTCHA_POSITIONS, targetCount));
  const distractors = CAPTCHA_KINDS.filter((k) => k !== target);
  return CAPTCHA_POSITIONS.map((i) => ({
    kind: targetPositions.has(i) ? target : pickOne(rng, distractors),
  }));
}

/** Seed the full challenge from one rng stream, in a fixed draw order. */
function buildCaptchaChallenge(rng: Rng): CaptchaChallenge {
  const target = pickOne(rng, CAPTCHA_KINDS);
  const grids: [CaptchaGrid, CaptchaGrid] = [
    buildCaptchaGrid(rng, target),
    buildCaptchaGrid(rng, target),
  ];
  let token = "OK-";
  for (let i = 0; i < 4; i++) token += pickOne(rng, TOKEN_ALPHABET);
  return { grids, target, token };
}

/** Rule 1 — a floor on length (code-point aware, so astral chars count once). */
const minLength12: Pg2RuleDef = {
  id: "min-length-12",
  act: "prologue",
  create: () => ({
    id: "min-length-12",
    act: "prologue",
    description: "Your password must be at least 12 characters.",
    validate: (password) => {
      const len = [...password].length;
      return { passed: len >= 12, message: `${len} / 12` };
    },
  }),
};

/** Rule 2 — at least one digit. */
const includeNumber: Pg2RuleDef = {
  id: "include-number",
  act: "prologue",
  create: () => ({
    id: "include-number",
    act: "prologue",
    description: "Your password must include a number.",
    validate: (password) => ({ passed: /\d/.test(password) }),
  }),
};

/** Rule 3 — at least one uppercase letter. */
const includeUppercase: Pg2RuleDef = {
  id: "include-uppercase",
  act: "prologue",
  create: () => ({
    id: "include-uppercase",
    act: "prologue",
    description: "Your password must include an uppercase letter.",
    validate: (password) => ({ passed: /[A-Z]/.test(password) }),
  }),
};

/** Rule 4 — at least one non-alphanumeric, non-whitespace character. */
const includeSpecial: Pg2RuleDef = {
  id: "include-special",
  act: "prologue",
  create: () => ({
    id: "include-special",
    act: "prologue",
    description: "Your password must include a special character.",
    validate: (password) => ({ passed: /[^A-Za-z0-9\s]/.test(password) }),
  }),
};

/**
 * Rule 5 — the rejecting image CAPTCHA. A seeded 3x3 tile challenge whose widget
 * rejects your first correct answer anyway (the intentional dark pattern), then
 * hands over a confirmation token on the second. The rule is satisfied once that
 * token appears in the password; everything the widget shows comes from the payload.
 */
const captchaHuman: Pg2RuleDef = {
  id: "captcha-human",
  act: "prologue",
  create: (rng) => {
    const captcha = buildCaptchaChallenge(rng);
    return {
      id: "captcha-human",
      act: "prologue",
      description:
        "Prove you are human. Complete the verification challenge and include your confirmation code.",
      payload: { captcha },
      validate: (password) => ({ passed: password.includes(captcha.token) }),
    };
  },
};

/** Prologue rules, in reveal order. */
export const PROLOGUE_RULES: readonly Pg2RuleDef[] = [
  minLength12,
  includeNumber,
  includeUppercase,
  includeSpecial,
  captchaHuman,
];
