import type { RuleDef } from "../types";
import { rangeInt } from "../prng";

const PAIRS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
const OPENS = new Set(["(", "[", "{"]);
const CLOSES = new Set([")", "]", "}"]);

/**
 * Checks that all brackets in the password form a valid balanced sequence
 * (ignoring non-bracket characters), AND there are at least `minBrackets`
 * bracket characters total. So `a(b[c]d)e` passes, `a([)]` fails.
 */
function bracketsBalancedAndAtLeast(s: string, minBrackets: number): boolean {
  const stack: string[] = [];
  let count = 0;
  for (const ch of s) {
    if (OPENS.has(ch)) {
      stack.push(ch);
      count++;
    } else if (CLOSES.has(ch)) {
      const top = stack.pop();
      if (top !== PAIRS[ch]) return false;
      count++;
    }
  }
  if (stack.length > 0) return false;
  return count >= minBrackets;
}

export const bracketBalanceRule: RuleDef = {
  id: "bracket-balance",
  tier: 3,
  create(rng) {
    const min = rangeInt(rng, 6, 10);
    return {
      id: "bracket-balance",
      tier: 3,
      description: `Your password's brackets — ( ) [ ] { } — must form a valid balanced sequence with at least ${min} bracket characters.`,
      params: { min },
      validate(state) {
        const bracketCount = [...state.password].filter(
          (c) => OPENS.has(c) || CLOSES.has(c)
        ).length;
        return {
          passed: bracketsBalancedAndAtLeast(state.password, min),
          message: `${bracketCount} / ${min}`,
        };
      },
    };
  },
};
