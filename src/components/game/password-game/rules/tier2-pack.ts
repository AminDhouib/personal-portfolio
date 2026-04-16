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

const NUM_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen", "twenty",
];
const TENS_WORDS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function numberToWords(n: number): string {
  if (n < 0) return "minus" + numberToWords(-n);
  if (n <= 20) return NUM_WORDS[n] ?? "";
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return ones === 0 ? TENS_WORDS[tens] : TENS_WORDS[tens] + NUM_WORDS[ones];
  }
  if (n === 100) return "onehundred";
  return String(n);
}

export const mathWordsRule: RuleDef = {
  id: "math-words",
  tier: 2,
  create(rng) {
    const ops = ["+", "*"] as const;
    const op = ops[Math.floor(rng() * ops.length)];
    const a = op === "*" ? rangeInt(rng, 2, 9) : rangeInt(rng, 5, 40);
    const b = op === "*" ? rangeInt(rng, 2, 9) : rangeInt(rng, 5, 40);
    const answer = op === "*" ? a * b : a + b;
    const answerWord = numberToWords(answer);
    return {
      id: "math-words",
      tier: 2,
      description: `Your password must include the word form of ${a} ${op} ${b} (e.g. "twentyone" = 21).`,
      params: { a, b, op, answer, answerWord },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(answerWord) };
      },
    };
  },
};
