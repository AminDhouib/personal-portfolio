import { SPAWN_ROWS } from "../engine/state";

// Canvas geometry for the painter. Distances are measured along a side's outward normal, from the
// centre: the hexagon's apothem, then one rowHeight per row of cells.

export interface Layout {
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** Centre to the middle of a side of the core hexagon. */
  apothem: number;
  rowHeight: number;
}

/** The core hexagon's apothem, in rows. */
const CORE_ROWS = 2.5;
// A hexagon's corner sits 1 / cos(30 degrees) further out than the middle of its side.
const CORNER_SCALE = 2 / Math.sqrt(3);

/**
 * Fits the board to the canvas: the outermost corner of a piece that has just spawned stays inside
 * the shorter dimension, less a margin (smaller when the game fills the screen).
 */
export function layout(width: number, height: number, immersive: boolean): Layout {
  const short = Math.min(width, height);
  const margin = short * (immersive ? 0.02 : 0.05);
  const reachRows = CORE_ROWS + SPAWN_ROWS + 1;
  const rowHeight = (short / 2 - margin) / CORNER_SCALE / reachRows;
  return {
    width,
    height,
    cx: width / 2,
    cy: height / 2,
    apothem: CORE_ROWS * rowHeight,
    rowHeight,
  };
}

/** Centre-to-corner radius of the hexagonal ring `rows` rows out from the core. */
export function ringRadius(l: Layout, rows: number): number {
  return (l.apothem + rows * l.rowHeight) * CORNER_SCALE;
}
