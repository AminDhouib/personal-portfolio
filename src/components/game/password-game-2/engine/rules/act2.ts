import type { Pg2RuleDef } from "../types";
import { pickN, pickOne } from "../rng";
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

/** One named swatch in the color-match palette. */
export interface ColorOption {
  name: string; // lowercase single word; see the inertness note on COLOR_PALETTE
  hex: string; // "#rrggbb"
}

/** The seeded color-match puzzle carried on the rule payload. */
export interface ColorMatch {
  name: string; // the true color's name (what the password must contain)
  hex: string; // the true color's swatch, shown big and unlabeled
  options: ColorOption[]; // seeded shuffle of the truth + 5 decoys (6 total)
}

/**
 * Twelve visually-distinct named colors. Every name is a lowercase single word,
 * so it is inert to the two rewriting rules by construction: roman-product reads
 * UPPERCASE [IVXLCDM] runs only (see roman.ts), so a lowercase name never seeds a
 * token (romanProduct(name) === 0), and no name carries a digit, so digit-sum
 * (rule 6) is undisturbed. The password stores the name lowercase and validate
 * matches it verbatim, so the inertness holds for the string actually typed.
 * Hexes are pairwise distinct; the rules test asserts both invariants.
 */
export const COLOR_PALETTE: readonly ColorOption[] = [
  { name: "crimson", hex: "#dc143c" },
  { name: "coral", hex: "#ff7f50" },
  { name: "amber", hex: "#ffbf00" },
  { name: "gold", hex: "#ffd700" },
  { name: "olive", hex: "#808000" },
  { name: "teal", hex: "#008080" },
  { name: "azure", hex: "#007fff" },
  { name: "indigo", hex: "#4b0082" },
  { name: "violet", hex: "#8a2be2" },
  { name: "magenta", hex: "#ff00ff" },
  { name: "salmon", hex: "#fa8072" },
  { name: "cyan", hex: "#00b7c3" },
];

/**
 * Perceptual near-twins that must never co-occur in one option set: amber/gold and
 * coral/salmon sit close enough in hue that a swatch beside its twin turns the match
 * into guesswork. Each still appears as the truth on its own seeds; only the decoy
 * pool excludes the truth's twin, and that exclusion happens BEFORE the seeded decoy
 * draw so determinism is preserved per seed. (Seeds that previously dealt a twin pair
 * reroll to a twin-free set; accepted pre-launch.)
 */
export const COLOR_CONFUSABLE: Record<string, string> = {
  amber: "gold",
  gold: "amber",
  coral: "salmon",
  salmon: "coral",
};

/**
 * Rule 15 — name the seasonal accent color. A seeded true color is shown as a big
 * unlabeled swatch; the widget offers it among five decoys drawn from the other
 * palette entries, and clicking the swatch whose hue matches types the color's
 * lowercase name into the password. The payload carries the truth plus a seeded
 * six-way shuffle of the candidates, so a daily or racing seed replays identically.
 * Validation is an exact lowercase includes — the description says lowercase.
 */
const colorMatch: Pg2RuleDef = {
  id: "color-match",
  act: "act2",
  create: (rng) => {
    // Draw order (truth, then decoys, then shuffle) is part of the seed contract:
    // reordering these draws rerolls every existing daily/racing seed. The twin
    // filter below sits between pickOne and pickN without adding or removing a draw.
    const truth = pickOne(rng, COLOR_PALETTE);
    const twin = COLOR_CONFUSABLE[truth.name];
    const decoys = pickN(
      rng,
      COLOR_PALETTE.filter((c) => c.name !== truth.name && c.name !== twin),
      5,
    );
    const options = pickN(rng, [truth, ...decoys], 6); // seeded shuffle of the six
    const color: ColorMatch = { name: truth.name, hex: truth.hex, options };
    return {
      id: "color-match",
      act: "act2",
      description: "Your password must name the color of the seasonal accent swatch (lowercase).",
      payload: { color },
      validate: (password) => ({ passed: password.includes(truth.name) }),
    };
  },
};

/** Act 2 rules, in reveal order. */
export const ACT2_RULES: readonly Pg2RuleDef[] = [
  romanNumeral,
  romanProductRule,
  countryName,
  currentTime,
  colorMatch,
];
