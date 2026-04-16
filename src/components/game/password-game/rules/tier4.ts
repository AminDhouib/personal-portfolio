import type { RuleDef } from "../types";
import { rangeInt } from "../prng";

const lengthBomb: RuleDef = {
  id: "length-bomb",
  tier: 4,
  create(rng) {
    const max = rangeInt(rng, 40, 60);
    return {
      id: "length-bomb",
      tier: 4,
      description: `Your password must be no longer than ${max} characters.`,
      params: { max },
      validate(state) {
        const len = [...state.password].length;
        return { passed: len <= max, message: `${len} / ${max}` };
      },
    };
  },
};

export const TIER_4_RULES: readonly RuleDef[] = [lengthBomb];
