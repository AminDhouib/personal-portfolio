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

export const TIER_3_RULES: readonly RuleDef[] = [everyNthUpper];
