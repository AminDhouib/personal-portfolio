import type { RuleDef } from "../types";
import { pickOne } from "../prng";

/**
 * All 8 dihedral symmetries of the Lo Shu 3×3 magic square (rows, columns,
 * and both diagonals sum to 15).
 */
const MAGIC_SQUARES: readonly (readonly number[])[] = [
  [2, 7, 6, 9, 5, 1, 4, 3, 8],
  [2, 9, 4, 7, 5, 3, 6, 1, 8],
  [4, 9, 2, 3, 5, 7, 8, 1, 6],
  [6, 1, 8, 7, 5, 3, 2, 9, 4],
  [8, 1, 6, 3, 5, 7, 4, 9, 2],
  [8, 3, 4, 1, 5, 9, 6, 7, 2],
  [4, 3, 8, 9, 5, 1, 2, 7, 6],
  [6, 7, 2, 1, 5, 9, 8, 3, 4],
];

export const MAGIC_MARKER_RE = /\[\[MAGIC:([0-9?,]+)\]\]/;

export const magicSquareRule: RuleDef = {
  id: "magic-square",
  tier: 3,
  create(rng) {
    const square = pickOne(rng, MAGIC_SQUARES);
    const blank = Math.floor(rng() * 9);
    const answer = square[blank];
    const valuesStr = square
      .map((v, i) => (i === blank ? "?" : String(v)))
      .join(",");
    return {
      id: "magic-square",
      tier: 3,
      description: `Your password must include the missing number from this magic square (every row, column, and diagonal sums to 15): [[MAGIC:${valuesStr}]]`,
      params: { answer, blank },
      validate(state) {
        const pattern = new RegExp(`(?<!\\d)${answer}(?!\\d)`);
        return { passed: pattern.test(state.password) };
      },
    };
  },
};
