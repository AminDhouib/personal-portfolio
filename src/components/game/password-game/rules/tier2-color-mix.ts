import type { RuleDef } from "../types";
import { pickOne } from "../prng";

/**
 * Color mix rule — tier 2. Shows two primary colors and asks the player to
 * name the subtractive mix (e.g. red + yellow = orange). The rule-card
 * renderer parses `[[MIX:a:b]]` and draws the two circles with a result slot.
 *
 * Subtractive (paint-style) mixing because it matches everyday intuition.
 */
export const MIX_MARKER_RE = /\[\[MIX:([a-z]+):([a-z]+)\]\]/;

interface MixPair {
  a: "red" | "yellow" | "blue" | "white" | "black";
  b: "red" | "yellow" | "blue" | "white" | "black";
  result: string;
}

const MIX_PAIRS: readonly MixPair[] = Object.freeze([
  { a: "red",    b: "yellow", result: "orange" },
  { a: "red",    b: "blue",   result: "purple" },
  { a: "yellow", b: "blue",   result: "green" },
  { a: "white",  b: "black",  result: "gray" },
  { a: "red",    b: "white",  result: "pink" },
  { a: "yellow", b: "red",    result: "orange" },
  { a: "blue",   b: "yellow", result: "green" },
]);

export const colorMixRule: RuleDef = {
  id: "color-mix",
  tier: 2,
  create(rng) {
    const pair = pickOne(rng, MIX_PAIRS);
    return {
      id: "color-mix",
      tier: 2,
      description: `Your password must name the color you get: [[MIX:${pair.a}:${pair.b}]]`,
      params: { a: pair.a, b: pair.b, result: pair.result },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(pair.result) };
      },
    };
  },
};
