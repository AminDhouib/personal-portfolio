import type { RuleDef } from "../types";
import { pickOne } from "../prng";
import { NATO_ALPHABET, NATO_LETTERS } from "../../../../data/password-game/nato";

const natoPhonetic: RuleDef = {
  id: "nato-phonetic",
  tier: 2,
  create(rng) {
    const letter = pickOne(rng, NATO_LETTERS);
    const word = NATO_ALPHABET[letter];
    return {
      id: "nato-phonetic",
      tier: 2,
      description: `Your password must include the NATO phonetic spelling for the letter "${letter}".`,
      params: { letter, word },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(word.toLowerCase()) };
      },
    };
  },
};

export const TIER_2_RULES: readonly RuleDef[] = [natoPhonetic];
