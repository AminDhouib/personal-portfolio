import type { RuleDef } from "../types";
import { pickOne, rangeInt } from "../prng";

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

const BLUR_WORDS = ["clarity", "focused", "sharpen", "vision", "crystal", "defined"];

const blurredInput: RuleDef = {
  id: "blurred-input",
  tier: 5,
  create(rng) {
    const target = pickOne(rng, BLUR_WORDS);
    return {
      id: "blurred-input",
      tier: 5,
      description: `Through the blur, spell "${target}" somewhere in your password.`,
      params: { target },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(target) };
      },
    };
  },
};

const BAD_LETTERS = ["t", "s", "r", "n", "l", "m", "d", "p"];

const noLetter: RuleDef = {
  id: "no-letter",
  tier: 5,
  create(rng) {
    const letter = BAD_LETTERS[rangeInt(rng, 0, BAD_LETTERS.length - 1)];
    return {
      id: "no-letter",
      tier: 5,
      description: `The letter "${letter}" (upper or lower) cannot appear in your password at all.`,
      params: { letter },
      validate(state) {
        const lower = state.password.toLowerCase();
        return { passed: !lower.includes(letter) };
      },
    };
  },
};

export const TIER_5_RULES: readonly RuleDef[] = [mirrorInput, blurredInput, noLetter];
