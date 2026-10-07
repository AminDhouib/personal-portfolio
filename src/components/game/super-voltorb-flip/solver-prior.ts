import { isRejected, placeCards, type BoardConfig } from "./hgss";
import type { CellValue } from "./types";

// How often one HGSS deal of a board config survives the free-multiplier
// check (hgss.ts isRejected). The solver needs it to weigh boards: given a
// config, each accepted layout has probability 1 / (layoutCount * rate).

// C(n, k) by the running product r * (n - i) / (i + 1); every step is an exact
// integer, so nothing rounds the way 25! in doubles would.
function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** Distinct layouts with the config's card counts: 25! / (V! twos! threes! ones!). */
export function layoutCount(config: BoardConfig): number {
  return (
    choose(25, config.voltorbs) *
    choose(25 - config.voltorbs, config.twos) *
    choose(25 - config.voltorbs - config.twos, config.threes)
  );
}

/** Share of single deals the caps accept, from `samples` seeded deals. */
export function estimateAcceptRate(
  config: BoardConfig,
  rng: () => number,
  samples: number,
): number {
  let accepted = 0;
  for (let i = 0; i < samples; i++) {
    const cells = Array<CellValue>(25).fill(1);
    placeCards(cells, "V", config.voltorbs, rng);
    placeCards(cells, 2, config.twos, rng);
    placeCards(cells, 3, config.threes, rng);
    if (!isRejected(cells, config)) accepted += 1;
  }
  return accepted / samples;
}

// Generated with estimateAcceptRate(BOARD_CONFIGS[id], mulberry32(1), 400_000) for
// each board id (mulberry32 is the seeded generator in solver-prior.test.ts; one
// fresh generator per board; about 32 s in total). Rounded to 4 places. Regenerate
// all 80 if hgss.ts ever changes. Ten boards per level, Lv.1 first.
// prettier-ignore
export const ACCEPT_RATE: readonly number[] = [
  // Lv.1
  0.6303, 0.4710, 0.6830, 0.6303, 0.6830, 0.6303, 0.4710, 0.6830, 0.6303, 0.6830,
  // Lv.2
  0.5518, 0.6402, 0.4154, 0.5518, 0.6402, 0.4559, 0.5032, 0.3472, 0.4559, 0.5032,
  // Lv.3
  0.5194, 0.6161, 0.7245, 0.5194, 0.5547, 0.4803, 0.5547, 0.6394, 0.4803, 0.5547,
  // Lv.4
  0.6394, 0.5194, 0.8729, 0.7608, 0.8315, 0.6394, 0.4803, 0.8553, 0.7508, 0.8136,
  // Lv.5
  0.8729, 0.7608, 0.8315, 0.8126, 0.8729, 0.8553, 0.7508, 0.8136, 0.8043, 0.8553,
  // Lv.6
  0.7608, 0.8315, 0.8126, 0.8729, 0.7608, 0.7508, 0.8136, 0.8043, 0.8553, 0.7508,
  // Lv.7
  0.8126, 0.8729, 0.8988, 0.9511, 0.8126, 0.8043, 0.8553, 0.8988, 0.9511, 0.8043,
  // Lv.8
  0.7608, 0.9076, 0.8126, 0.8729, 0.9076, 0.7508, 0.8923, 0.8043, 0.8553, 0.8923,
];
