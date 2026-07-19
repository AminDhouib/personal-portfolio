import type { Pg2RuleDef } from "../types";

/** The exact phrase the captcha rule demands, verbatim and case-sensitive. */
export const CAPTCHA_PHRASE = "I am human";

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

/** Rule 5 — the classic gag: the password must literally contain "I am human". */
const captchaHuman: Pg2RuleDef = {
  id: "captcha-human",
  act: "prologue",
  create: () => ({
    id: "captcha-human",
    act: "prologue",
    description: `Prove you are human. Type: ${CAPTCHA_PHRASE}`,
    validate: (password) => ({ passed: password.includes(CAPTCHA_PHRASE) }),
  }),
};

/** Prologue rules, in reveal order. */
export const PROLOGUE_RULES: readonly Pg2RuleDef[] = [
  minLength12,
  includeNumber,
  includeUppercase,
  includeSpecial,
  captchaHuman,
];
