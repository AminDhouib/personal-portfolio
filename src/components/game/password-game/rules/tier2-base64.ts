import type { RuleDef } from "../types";
import { pickOne } from "../prng";

/**
 * Base64 decode rule — tier 2. Displays a base64-encoded short word and asks
 * the player to include its decoded form. Uses a limited word list so the
 * player doesn't need a base64 tool — just pattern-matching help.
 */
const BASE64_WORDS: readonly string[] = [
  "cat", "dog", "sun", "moon", "star", "fish", "zero", "hero",
  "code", "blue", "red", "gold", "frog", "wolf", "lava", "rain",
];

function b64(s: string): string {
  if (typeof btoa === "function") return btoa(s);
  return Buffer.from(s, "utf8").toString("base64");
}

export const base64Rule: RuleDef = {
  id: "base64",
  tier: 2,
  create(rng) {
    const word = pickOne(rng, BASE64_WORDS);
    const encoded = b64(word);
    return {
      id: "base64",
      tier: 2,
      description: `Your password must include the plaintext of this Base64 string: ${encoded}`,
      params: { word, encoded },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(word) };
      },
    };
  },
};
