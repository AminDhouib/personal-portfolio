import type { RuleDef } from "../types";
import { pickN, rangeInt } from "../prng";

const minLength: RuleDef = {
  id: "min-length",
  tier: 1,
  create(rng) {
    const n = rangeInt(rng, 6, 9);
    return {
      id: "min-length",
      tier: 1,
      description: `Your password must be at least ${n} characters.`,
      params: { n },
      validate(state) {
        const len = [...state.password].length;
        return {
          passed: len >= n,
          message: `${len} / ${n}`,
        };
      },
    };
  },
};

const digitCount: RuleDef = {
  id: "digit-count",
  tier: 1,
  create(rng) {
    const n = rangeInt(rng, 1, 3);
    return {
      id: "digit-count",
      tier: 1,
      description: `Your password must include at least ${n} digit${n === 1 ? "" : "s"}.`,
      params: { n },
      validate(state) {
        const count = (state.password.match(/\d/g) ?? []).length;
        return { passed: count >= n, message: `${count} / ${n}` };
      },
    };
  },
};

const uppercase: RuleDef = {
  id: "uppercase",
  tier: 1,
  create() {
    return {
      id: "uppercase",
      tier: 1,
      description: "Your password must include an uppercase letter.",
      params: {},
      validate(state) {
        return { passed: /[A-Z]/.test(state.password) };
      },
    };
  },
};

const SPECIAL_POOL = "!@#$%^&*";

const specialChar: RuleDef = {
  id: "special-char",
  tier: 1,
  create(rng) {
    const subset = pickN(rng, SPECIAL_POOL.split(""), 3).join("");
    return {
      id: "special-char",
      tier: 1,
      description: `Your password must include a special character from: ${subset}`,
      params: { chars: subset },
      validate(state) {
        for (const ch of subset) {
          if (state.password.includes(ch)) return { passed: true };
        }
        return { passed: false };
      },
    };
  },
};

const digitSum: RuleDef = {
  id: "digit-sum",
  tier: 1,
  create(rng) {
    const target = rangeInt(rng, 15, 30);
    return {
      id: "digit-sum",
      tier: 1,
      description: `The digits in your password must add up to ${target}.`,
      params: { target },
      validate(state) {
        let sum = 0;
        for (const ch of state.password) {
          const n = Number(ch);
          if (Number.isInteger(n) && ch.trim() !== "") sum += n;
        }
        return { passed: sum === target, message: `${sum} / ${target}` };
      },
    };
  },
};

const COLOR_NAMES = [
  "red", "blue", "green", "yellow", "purple", "orange", "pink",
  "violet", "indigo", "coral", "teal", "cyan", "magenta", "lime",
  "gold", "silver", "black", "white", "brown", "gray",
];

const colorName: RuleDef = {
  id: "color-name",
  tier: 1,
  create() {
    return {
      id: "color-name",
      tier: 1,
      description: "Your password must include a color name.",
      params: { colors: COLOR_NAMES },
      validate(state) {
        const lower = state.password.toLowerCase();
        for (const c of COLOR_NAMES) {
          if (lower.includes(c)) return { passed: true };
        }
        return { passed: false };
      },
    };
  },
};

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const dayOfWeek: RuleDef = {
  id: "day-of-week",
  tier: 1,
  create() {
    return {
      id: "day-of-week",
      tier: 1,
      description: "Your password must include a day of the week.",
      params: {},
      validate(state) {
        const lower = state.password.toLowerCase();
        return { passed: DAYS.some((d) => lower.includes(d)) };
      },
    };
  },
};

const PLANETS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"];

const planet: RuleDef = {
  id: "planet",
  tier: 1,
  create() {
    return {
      id: "planet",
      tier: 1,
      description: "Your password must include the name of a planet.",
      params: {},
      validate(state) {
        const lower = state.password.toLowerCase();
        return { passed: PLANETS.some((p) => lower.includes(p)) };
      },
    };
  },
};

export const TIER_1_RULES: readonly RuleDef[] = [minLength, digitCount, uppercase, specialChar, digitSum, colorName, dayOfWeek, planet];
