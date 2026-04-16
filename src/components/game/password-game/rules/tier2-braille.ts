import type { RuleDef } from "../types";
import { pickOne } from "../prng";
import { BRAILLE_WORDS, toBraille } from "../../../../data/password-game/braille";

export const brailleRule: RuleDef = {
  id: "braille",
  tier: 2,
  create(rng) {
    const word = pickOne(rng, BRAILLE_WORDS);
    const braille = toBraille(word);
    return {
      id: "braille",
      tier: 2,
      description: `Your password must include the English word shown in Braille: [[BRAILLE:${braille}]]`,
      params: { word, braille },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(word) };
      },
    };
  },
};
