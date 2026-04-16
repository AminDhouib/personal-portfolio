import type { RuleDef } from "../types";
import { pickOne, rangeInt } from "../prng";

/**
 * Emoji math — a two-variable system where each emoji stands for a digit.
 * The player solves for one emoji's value and includes it in their password.
 *
 * Example: "🍎 + 🍌 = 10 and 🍎 - 🍌 = 4. Include the value of 🍎."
 * Answer: 7 (a + b = 10, a - b = 4 → a = 7).
 */
const EMOJI_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["🍎", "🍌"],
  ["🔑", "🔒"],
  ["⭐", "🌙"],
  ["🐱", "🐶"],
  ["🎲", "🃏"],
  ["🌳", "🍃"],
  ["⚡", "🔥"],
  ["🎵", "🎸"],
];

export const emojiMathRule: RuleDef = {
  id: "emoji-math",
  tier: 3,
  create(rng) {
    const [e1, e2] = pickOne(rng, EMOJI_PAIRS);
    // Pick distinct values 1..9; a > b so the difference is positive.
    const a = rangeInt(rng, 3, 9);
    const b = rangeInt(rng, 1, a - 1);
    const sum = a + b;
    const diff = a - b;
    const askFirst = rng() < 0.5;
    const targetEmoji = askFirst ? e1 : e2;
    const answer = askFirst ? a : b;

    return {
      id: "emoji-math",
      tier: 3,
      description:
        `If ${e1} + ${e2} = ${sum} and ${e1} − ${e2} = ${diff}, ` +
        `your password must include the value of ${targetEmoji}.`,
      params: { e1, e2, sum, diff, targetEmoji, answer },
      validate(state) {
        return {
          passed: new RegExp(`(?<!\\d)${answer}(?!\\d)`).test(state.password),
        };
      },
    };
  },
};
