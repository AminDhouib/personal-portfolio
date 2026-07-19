import type { Pg2RuleDef } from "../types";
import { pickOne } from "../rng";
import { romanProduct } from "./roman";
import { FREEBIE_MESSAGE } from "./act1";
import { getInjectedCapitals } from "../../../../../data/password-game/capitals";

/** Rule 10 — the password must contain a Roman numeral (uppercase letters only). */
const romanNumeral: Pg2RuleDef = {
  id: "roman-numeral",
  act: "act2",
  create: () => ({
    id: "roman-numeral",
    act: "act2",
    description: "Your password must include a Roman numeral.",
    validate: (password) => ({ passed: /[IVXLCDM]/.test(password) }),
  }),
};

/** The seeded targets for the product rule — each is reachable as one numeral. */
export const ROMAN_PRODUCT_TARGETS: readonly number[] = [12, 18, 20, 24, 35, 42];

/** Rule 11 — the Roman tokens must multiply to a seeded target. */
const romanProductRule: Pg2RuleDef = {
  id: "roman-product",
  act: "act2",
  create: (rng) => {
    const target = pickOne(rng, ROMAN_PRODUCT_TARGETS);
    return {
      id: "roman-product",
      act: "act2",
      description: `The Roman numerals in your password must multiply to ${target}.`,
      payload: { target },
      validate: (password) => {
        const product = romanProduct(password);
        return { passed: product === target, message: `${product} / ${target}` };
      },
    };
  },
};

/**
 * Rule 12 — the name of a seeded country, from the live feed only. When the
 * injected list is unset the rule is a freebie; it never falls back to the
 * static capitals pool. The module carries no flag artwork, so the payload
 * carries just the country name for the stage to render.
 */
const countryName: Pg2RuleDef = {
  id: "country-name",
  act: "act2",
  create: (rng) => {
    const injected = getInjectedCapitals();
    const country = injected === null ? null : pickOne(rng, injected).country;
    return {
      id: "country-name",
      act: "act2",
      description: "Your password must include the name of this country.",
      payload: { country },
      validate: (password) => {
        if (country === null) return { passed: true, message: FREEBIE_MESSAGE };
        return { passed: password.toLowerCase().includes(country.toLowerCase()) };
      },
    };
  },
};

/**
 * Rule 13 — the current wall-clock time, HH:MM. Read from the injected clock at
 * every validation, so it re-fails as the minute rolls over (revalidates live).
 */
const currentTime: Pg2RuleDef = {
  id: "current-time",
  act: "act2",
  create: () => ({
    id: "current-time",
    act: "act2",
    description: "Your password must include the current time (HH:MM).",
    validate: (password, _state, api) => {
      const now = api.nowHHMM();
      return { passed: password.includes(now), message: now };
    },
  }),
};

/** Act 2 rules, in reveal order. */
export const ACT2_RULES: readonly Pg2RuleDef[] = [
  romanNumeral,
  romanProductRule,
  countryName,
  currentTime,
];
