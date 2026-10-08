import { scoreClear } from "./scoring";
import { COLOURS, SIDES, emit, wrapSide } from "./state";
import type { Cell, Colour, Pos, RunState } from "./types";

// Groups, bomb blasts, gravity and chains (spec sections 4 and 5). The board functions take the
// stacks directly so tests can drive them on hand-built boards.

/** A clear needs at least this many connected cells. */
export const MIN_GROUP = 3;
// A bomb blast reaches this many rows either way on its own side, and on each adjacent side.
const BLAST_OWN_ROWS = 2;
const BLAST_NEXT_ROWS = 1;

const key = (side: number, row: number) => side * 1000 + row;

function cellAt(sides: Cell[][], side: number, row: number): Cell | undefined {
  return sides[side]?.[row];
}

function joins(cell: Cell, colour: Colour): boolean {
  return cell.special === "rainbow" || cell.colour === colour;
}

function groupOfColour(sides: Cell[][], start: Pos, colour: Colour): Pos[] {
  const seen = new Set<number>([key(start.side, start.row)]);
  const out: Pos[] = [];
  const todo: Pos[] = [start];
  for (let pos = todo.pop(); pos; pos = todo.pop()) {
    out.push(pos);
    const neighbours: Pos[] = [
      { side: pos.side, row: pos.row - 1 },
      { side: pos.side, row: pos.row + 1 },
      { side: wrapSide(pos.side - 1), row: pos.row },
      { side: wrapSide(pos.side + 1), row: pos.row },
    ];
    for (const n of neighbours) {
      const k = key(n.side, n.row);
      if (seen.has(k)) continue;
      const cell = cellAt(sides, n.side, n.row);
      if (!cell || !joins(cell, colour)) continue;
      seen.add(k);
      todo.push(n);
    }
  }
  return out;
}

/**
 * The group containing a cell, with the colour it counts as. A rainbow takes whichever colour
 * gives the largest group (the lowest colour on a tie).
 */
export function findGroup(
  sides: Cell[][],
  side: number,
  row: number,
): { cells: Pos[]; colour: Colour } {
  const cell = cellAt(sides, side, row);
  if (!cell) return { cells: [], colour: 0 };
  const start = { side, row };
  if (cell.special !== "rainbow") {
    return { cells: groupOfColour(sides, start, cell.colour), colour: cell.colour };
  }
  let best: { cells: Pos[]; colour: Colour } = { cells: [], colour: cell.colour };
  for (let c = 0; c < COLOURS; c++) {
    const colour = c as Colour;
    const cells = groupOfColour(sides, start, colour);
    if (cells.length > best.cells.length) best = { cells, colour };
  }
  return best;
}

/** The first clearable group, scanning side 0 upward and each side from its lowest row. */
function firstGroup(sides: Cell[][]): { cells: Pos[]; colour: Colour } | null {
  for (let side = 0; side < SIDES; side++) {
    const height = sides[side]?.length ?? 0;
    for (let row = 0; row < height; row++) {
      const group = findGroup(sides, side, row);
      if (group.cells.length >= MIN_GROUP) return group;
    }
  }
  return null;
}

/** The group plus every cell caught in the blast of a bomb inside it. */
function withBlasts(state: RunState, group: Pos[]): Pos[] {
  const hit = new Map<number, Pos>(group.map((p) => [key(p.side, p.row), p]));
  const take = (side: number, row: number) => {
    if (cellAt(state.sides, side, row)) hit.set(key(side, row), { side, row });
  };
  for (const pos of group) {
    if (cellAt(state.sides, pos.side, pos.row)?.special !== "bomb") continue;
    emit(state, { type: "bomb", side: pos.side, row: pos.row });
    for (let d = -BLAST_OWN_ROWS; d <= BLAST_OWN_ROWS; d++) take(pos.side, pos.row + d);
    for (let d = -BLAST_NEXT_ROWS; d <= BLAST_NEXT_ROWS; d++) {
      take(wrapSide(pos.side - 1), pos.row + d);
      take(wrapSide(pos.side + 1), pos.row + d);
    }
  }
  return [...hit.values()];
}

/** Removes cells and closes the gaps within each side. Returns whether anything dropped. */
export function removeCells(sides: Cell[][], cells: Pos[]): boolean {
  const gone = new Set(cells.map((p) => key(p.side, p.row)));
  let dropped = false;
  sides.forEach((stack, side) => {
    const kept = stack.filter((_, row) => !gone.has(key(side, row)));
    if (kept.length === stack.length) return;
    // A kept cell drops if any removed cell sat below it.
    const lowestGone = stack.findIndex((_, row) => gone.has(key(side, row)));
    if (lowestGone >= 0 && lowestGone < kept.length) dropped = true;
    sides[side] = kept;
  });
  return dropped;
}

function boardEmpty(sides: Cell[][]): boolean {
  return sides.every((stack) => stack.length === 0);
}

/**
 * Settles the consequences of a cell landing at (side, row): its group clears if it is big
 * enough, then gravity runs and any groups it forms clear as chains, one per pass.
 */
export function resolveClears(state: RunState, side: number, row: number): void {
  const first = findGroup(state.sides, side, row);
  let group = first.cells.length >= MIN_GROUP ? first : null;
  let gravityChain = false;
  while (group) {
    const cells = withBlasts(state, group.cells);
    const dropped = removeCells(state.sides, cells);
    scoreClear(state, cells, group.colour, gravityChain, boardEmpty(state.sides));
    if (dropped) emit(state, { type: "gravity" });
    gravityChain = true;
    group = firstGroup(state.sides);
  }
}
