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

export const TIER_1_RULES: readonly RuleDef[] = [minLength, digitCount, uppercase, specialChar];
