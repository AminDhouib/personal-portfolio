import type { Pg2RuleDef } from "../types";

/** Prologue: a floor on length. */
const minLength12: Pg2RuleDef = {
  id: "min-length-12",
  act: "prologue",
  create: () => ({
    id: "min-length-12",
    act: "prologue",
    description: "Your password must be at least 12 characters.",
    validate: (password) => ({ passed: [...password].length >= 12 }),
  }),
};

/** Prologue: at least one digit. */
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

/**
 * Authored core-rule roster, in reveal order. Task 4 replaces this seam with the
 * full seventeen rules across five acts; the engine reads only this manifest.
 */
export const CORE_RULES: Pg2RuleDef[] = [minLength12, includeNumber];
