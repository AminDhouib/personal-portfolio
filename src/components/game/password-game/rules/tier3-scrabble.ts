import type { RuleDef } from "../types";
import { rangeInt } from "../prng";

/**
 * Scrabble rule — tier 3. Player must include a contiguous alphabetic
 * substring of at least 3 letters whose Scrabble tile values sum to exactly
 * the target score.
 */
const SCORES: Record<string, number> = {
  a: 1, e: 1, i: 1, l: 1, n: 1, o: 1, r: 1, s: 1, t: 1, u: 1,
  d: 2, g: 2,
  b: 3, c: 3, m: 3, p: 3,
  f: 4, h: 4, v: 4, w: 4, y: 4,
  k: 5,
  j: 8, x: 8,
  q: 10, z: 10,
};

function scoreOf(word: string): number {
  let total = 0;
  for (const ch of word.toLowerCase()) {
    total += SCORES[ch] ?? 0;
  }
  return total;
}

function hasWordWithScore(password: string, target: number): boolean {
  // Find all maximal alphabetic runs, then check every substring ≥ 3 letters.
  const runs = password.match(/[a-zA-Z]+/g) ?? [];
  for (const run of runs) {
    for (let start = 0; start < run.length; start++) {
      let sum = 0;
      for (let end = start; end < run.length; end++) {
        sum += SCORES[run[end].toLowerCase()] ?? 0;
        if (sum > target) break;
        if (end - start + 1 >= 3 && sum === target) return true;
      }
    }
  }
  return false;
}

export const scrabbleRule: RuleDef = {
  id: "scrabble",
  tier: 3,
  create(rng) {
    const target = rangeInt(rng, 8, 16);
    return {
      id: "scrabble",
      tier: 3,
      description: `Your password must contain a run of letters (3+ long) whose Scrabble tile values sum to exactly ${target}. (a/e/i/o=1, d/g=2, b/c/m/p=3, f/h/v/w/y=4, k=5, j/x=8, q/z=10)`,
      params: { target },
      validate(state) {
        return { passed: hasWordWithScore(state.password, target) };
      },
    };
  },
};
