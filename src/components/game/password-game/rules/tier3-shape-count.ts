import type { RuleDef } from "../types";
import { rangeInt, pickOne } from "../prng";

/**
 * Shape count rule — tier 3. Renders a 4×4 grid of three mixed shapes
 * (triangle, circle, square) and asks the player to count how many of one
 * specific shape there are.
 *
 * Marker format: `[[SHAPES:TCSCTCSS...:T]]` where the first chunk is 16
 * chars encoding shape per cell (T/C/S) and the second is the target char.
 */
const SHAPES = ["T", "C", "S"] as const;
type Shape = (typeof SHAPES)[number];

const SHAPE_NAMES: Record<Shape, string> = { T: "triangle", C: "circle", S: "square" };

export const SHAPES_MARKER_RE = /\[\[SHAPES:([TCS]{16}):([TCS])\]\]/;

export const shapeCountRule: RuleDef = {
  id: "shape-count",
  tier: 3,
  create(rng) {
    // Fill 16 cells, each weighted toward roughly-equal distribution.
    const cells: Shape[] = [];
    for (let i = 0; i < 16; i++) cells.push(SHAPES[rangeInt(rng, 0, 2)]);
    const target = pickOne(rng, SHAPES);
    const count = cells.filter((c) => c === target).length;
    const encoded = cells.join("");
    return {
      id: "shape-count",
      tier: 3,
      description: `Your password must include the number of ${SHAPE_NAMES[target]}s in this grid: [[SHAPES:${encoded}:${target}]]`,
      params: { target, count, cells: encoded },
      validate(state) {
        const matches = state.password.match(/(?<!\d)\d+(?!\d)/g) ?? [];
        return { passed: matches.some((m) => Number(m) === count) };
      },
    };
  },
};
