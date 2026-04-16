import type { RuleDef } from "../types";
import { pickOne } from "../prng";

/**
 * Phone keypad rule — tier 2. Classic T9-style mapping where each letter
 * maps to a single digit (2=ABC, 3=DEF, 4=GHI, 5=JKL, 6=MNO, 7=PQRS, 8=TUV,
 * 9=WXYZ). Player is shown a target word and must include its digit code in
 * the password.
 */
const KEYPAD: Record<string, string> = {
  A: "2", B: "2", C: "2",
  D: "3", E: "3", F: "3",
  G: "4", H: "4", I: "4",
  J: "5", K: "5", L: "5",
  M: "6", N: "6", O: "6",
  P: "7", Q: "7", R: "7", S: "7",
  T: "8", U: "8", V: "8",
  W: "9", X: "9", Y: "9", Z: "9",
};

const PHONE_WORDS: readonly string[] = [
  "HELLO", "PIZZA", "CLOUD", "MUSIC", "TIGER", "LUNCH",
  "JAZZY", "BRAVE", "CHESS", "QUEEN", "FOXES", "FROST",
];

function encode(word: string): string {
  return [...word.toUpperCase()].map((c) => KEYPAD[c] ?? "").join("");
}

export const phoneKeypadRule: RuleDef = {
  id: "phone-keypad",
  tier: 2,
  create(rng) {
    const word = pickOne(rng, PHONE_WORDS);
    const code = encode(word);
    return {
      id: "phone-keypad",
      tier: 2,
      description: `Your password must include the phone keypad code for "${word}". (2=ABC 3=DEF 4=GHI 5=JKL 6=MNO 7=PQRS 8=TUV 9=WXYZ)`,
      params: { word, code },
      validate(state) {
        const pattern = new RegExp(`(?<!\\d)${code}(?!\\d)`);
        return { passed: pattern.test(state.password) };
      },
    };
  },
};
