import type { CellStatus, CharCell } from "./types";

/** Statuses whose cells are rendered but excluded from the password value. */
export const VALUE_EXCLUDED: ReadonlySet<CellStatus> = new Set<CellStatus>([
  "parasite",
  "orbiting",
  "abducted",
  "ember",
]);

/** Build a fresh cell run from a string, code-point aware, all cells "normal". */
export function makeCells(
  text: string,
  nextCellId: number,
): { cells: CharCell[]; nextCellId: number } {
  const cells: CharCell[] = [];
  let id = nextCellId;
  for (const ch of text) {
    cells.push({ id: id++, ch, status: "normal" });
  }
  return { cells, nextCellId: id };
}

/** The submitted password: cell characters in order, skipping VALUE_EXCLUDED. */
export function cellsToPassword(cells: readonly CharCell[]): string {
  let out = "";
  for (const cell of cells) {
    if (!VALUE_EXCLUDED.has(cell.status)) out += cell.ch;
  }
  return out;
}

/** Insert each code point of text as a new cell at caret; returns advanced caret and ids. */
export function insertText(
  cells: readonly CharCell[],
  caret: number,
  text: string,
  nextCellId: number,
): { cells: CharCell[]; caret: number; nextCellId: number } {
  const inserted = makeCells(text, nextCellId);
  const next = [...cells.slice(0, caret), ...inserted.cells, ...cells.slice(caret)];
  return { cells: next, caret: caret + inserted.cells.length, nextCellId: inserted.nextCellId };
}

/** Remove cells with indices in [from, to); caret clamps to from. */
export function deleteRange(
  cells: readonly CharCell[],
  from: number,
  to: number,
): { cells: CharCell[]; caret: number } {
  const next = [...cells.slice(0, from), ...cells.slice(to)];
  return { cells: next, caret: from };
}

/** Index of the cell with the given id, or -1 if absent. */
export function findCellIndex(cells: readonly CharCell[], id: number): number {
  return cells.findIndex((cell) => cell.id === id);
}
