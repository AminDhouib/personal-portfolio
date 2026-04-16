import type { RuleDef } from "../types";
import { pickOne, rangeInt } from "../prng";
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

export const binaryRule: RuleDef = {
  id: "binary",
  tier: 2,
  create(rng) {
    const n = rangeInt(rng, 10, 99);
    const binary = n.toString(2);
    return {
      id: "binary",
      tier: 2,
      description: `Your password must include the binary representation of ${n}.`,
      params: { n, binary },
      validate(state) {
        // Match the binary string not as part of a longer run of 0/1.
        const pattern = new RegExp(`(?<![01])${binary}(?![01])`);
        return { passed: pattern.test(state.password) };
      },
    };
  },
};
