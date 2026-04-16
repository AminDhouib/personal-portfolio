import type { RuleDef } from "../types";
import { pickOne } from "../prng";

const MIRROR_WORDS = ["reflect", "mirror", "reverse", "backwards", "flipped", "invert"];

const mirrorInput: RuleDef = {
  id: "mirror-input",
  tier: 5,
  create(rng) {
    const target = pickOne(rng, MIRROR_WORDS);
    return {
      id: "mirror-input",
      tier: 5,
      description: `Look into the mirror. Type the word "${target}" anywhere in your password.`,
      params: { target },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(target) };
      },
    };
  },
};

export const TIER_5_RULES: readonly RuleDef[] = [mirrorInput];
