import type { RuleDef } from "../types";
import { pickOne, rangeInt } from "../prng";
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

type MathOp = "+" | "-" | "*";

function evalMath(a: number, op: MathOp, b: number): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
  }
}

const mathEquation: RuleDef = {
  id: "math-equation",
  tier: 2,
  create(rng) {
    const ops: MathOp[] = ["+", "-", "*"];
    const op = ops[Math.floor(rng() * ops.length)];
    const a = op === "*" ? rangeInt(rng, 2, 9) : rangeInt(rng, 10, 50);
    const b = op === "*" ? rangeInt(rng, 2, 9) : rangeInt(rng, 1, 20);
    const answer = evalMath(a, op, b);
    return {
      id: "math-equation",
      tier: 2,
      description: `Your password must include the answer to: ${a} ${op} ${b}`,
      params: { a, b, op, answer },
      validate(state) {
        const abs = Math.abs(answer);
        if (answer < 0) {
          const hasSigned = new RegExp(`(?<!\\d)-${abs}(?!\\d)`).test(state.password);
          const hasUnsigned = new RegExp(`(?<!\\d)${abs}(?!\\d)`).test(state.password);
          return { passed: hasSigned || hasUnsigned };
        }
        return { passed: new RegExp(`(?<!\\d)${abs}(?!\\d)`).test(state.password) };
      },
    };
  },
};

export const TIER_2_RULES: readonly RuleDef[] = [natoPhonetic, mathEquation];
