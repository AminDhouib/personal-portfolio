import type { RuleDef } from "../types";
import { rangeInt } from "../prng";

const everyNthUpper: RuleDef = {
  id: "every-nth-upper",
  tier: 3,
  create(rng) {
    const n = rangeInt(rng, 2, 4);
    return {
      id: "every-nth-upper",
      tier: 3,
      description: `Every ${nth(n)} letter of your password must be uppercase.`,
      params: { n },
      validate(state) {
        let letterIdx = 0;
        for (const ch of state.password) {
          if (!/[a-zA-Z]/.test(ch)) continue;
          letterIdx++;
          const shouldBeUpper = letterIdx % n === 0;
          const isUpper = ch === ch.toUpperCase() && ch !== ch.toLowerCase();
          if (shouldBeUpper && !isUpper) return { passed: false };
          if (!shouldBeUpper && isUpper) return { passed: false };
        }
        // Must have at least one uppercase letter at the nth position,
        // otherwise a short password like "abc" (with n=4) would pass trivially.
        return { passed: letterIdx >= n };
      },
    };
  },
};

function nth(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

const wordCountStrict: RuleDef = {
  id: "word-count-strict",
  tier: 3,
  create(rng) {
    const n = rangeInt(rng, 5, 8);
    return {
      id: "word-count-strict",
      tier: 3,
      description: `Your password must contain exactly ${n} space-separated words.`,
      params: { n },
      validate(state) {
        const words = state.password.trim().split(/\s+/).filter((w) => w.length > 0);
        return { passed: words.length === n, message: `${words.length} / ${n}` };
      },
    };
  },
};

export const TIER_3_RULES: readonly RuleDef[] = [everyNthUpper, wordCountStrict];
