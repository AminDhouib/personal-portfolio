import type { RuleDef } from "../types";
import { pickOne } from "../prng";
import { MORSE_WORDS, toMorse } from "../../../../data/password-game/morse";

export const morseRule: RuleDef = {
  id: "morse",
  tier: 2,
  create(rng) {
    const word = pickOne(rng, MORSE_WORDS);
    const morse = toMorse(word);
    return {
      id: "morse",
      tier: 2,
      description: `Your password must include the morse code for "${word}": ${morse}`,
      params: { word, morse },
      validate(state) {
        return { passed: state.password.includes(morse) };
      },
    };
  },
};
