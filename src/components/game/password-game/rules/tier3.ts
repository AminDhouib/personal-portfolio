import type { RuleDef, FormattingMap } from "../types";
import { rangeInt } from "../prng";

function countFmt(fmt: FormattingMap, attr: "bold" | "italic"): number {
  let n = 0;
  for (const f of fmt) if (f[attr]) n++;
  return n;
}

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

const alternatingCase: RuleDef = {
  id: "alternating-case",
  tier: 3,
  create() {
    return {
      id: "alternating-case",
      tier: 3,
      description: "Your password's letters must strictly alternate between lowercase and uppercase (starting with lowercase).",
      params: {},
      validate(state) {
        let letters = 0;
        for (const ch of state.password) {
          if (!/[a-zA-Z]/.test(ch)) continue;
          letters++;
          const expectedLower = letters % 2 === 1;
          const isLower = ch === ch.toLowerCase() && ch !== ch.toUpperCase();
          const isUpper = ch === ch.toUpperCase() && ch !== ch.toLowerCase();
          if (expectedLower && !isLower) return { passed: false };
          if (!expectedLower && !isUpper) return { passed: false };
        }
        return { passed: letters >= 4 };
      },
    };
  },
};

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

const boldCount: RuleDef = {
  id: "bold-count",
  tier: 3,
  create(rng) {
    const n = rangeInt(rng, 3, 6);
    return {
      id: "bold-count",
      tier: 3,
      description: `At least ${n} characters of your password must be bold.`,
      params: { n },
      validate(state) {
        const c = countFmt(state.formatting, "bold");
        return { passed: c >= n, message: `${c} / ${n}` };
      },
    };
  },
};

export const TIER_3_RULES: readonly RuleDef[] = [everyNthUpper, wordCountStrict, alternatingCase, boldCount];
