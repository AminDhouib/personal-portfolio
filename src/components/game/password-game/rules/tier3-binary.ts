import type { RuleDef } from "../types";
import { rangeInt } from "../prng";

/**
 * Binary decode rule — tier 3. Picks a number in [16, 199] and shows its
 * 8-bit binary representation as dots. The player types the decimal value.
 *
 * Marker format: `[[BINARY:bits]]` where `bits` is the 8-char 0/1 string.
 * Accepts the decimal number as a standalone integer in the password.
 */
export const BINARY_MARKER_RE = /\[\[BINARY:([01]{8})\]\]/;

export const binaryDecodeRule: RuleDef = {
  id: "binary-decode",
  tier: 3,
  create(rng) {
    const n = rangeInt(rng, 16, 199);
    const bits = n.toString(2).padStart(8, "0");
    return {
      id: "binary-decode",
      tier: 3,
      description: `Your password must include the decimal value of this binary number: [[BINARY:${bits}]]`,
      params: { n, bits },
      validate(state) {
        const matches = state.password.match(/(?<!\d)\d+(?!\d)/g) ?? [];
        return { passed: matches.some((m) => Number(m) === n) };
      },
    };
  },
};
