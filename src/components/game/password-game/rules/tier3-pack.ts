import type { RuleDef } from "../types";
import { pickOne } from "../prng";
import { ANAGRAM_WORDS, scramble } from "../../../../data/password-game/anagrams";

export const anagramRule: RuleDef = {
  id: "anagram",
  tier: 3,
  create(rng) {
    const word = pickOne(rng, ANAGRAM_WORDS);
    const scrambled = scramble(word, rng).toUpperCase();
    return {
      id: "anagram",
      tier: 3,
      description: `Your password must contain the unscramble of: ${scrambled}`,
      params: { word, scrambled },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(word) };
      },
    };
  },
};

const REVERSE_WORDS = [
  "hello", "world", "night", "today", "knife", "dream", "river", "magic",
  "cloud", "storm", "music", "tiger", "piano", "ocean",
];

export const reverseRule: RuleDef = {
  id: "word-reverse",
  tier: 3,
  create(rng) {
    const word = pickOne(rng, REVERSE_WORDS);
    const reversed = [...word].reverse().join("");
    return {
      id: "word-reverse",
      tier: 3,
      description: `Your password must include the reverse of "${word}".`,
      params: { word, reversed },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(reversed) };
      },
    };
  },
};
