import type { MemoFlag } from "./memo-button";

/** One memo toggle: the tile and the flag that was toggled. Toggling it again undoes it. */
export type MemoChange = { row: number; col: number; flag: MemoFlag };

/** The undo history is bounded so a long round cannot grow it without limit. */
export const MEMO_UNDO_LIMIT = 50;

export function pushMemo(stack: readonly MemoChange[], change: MemoChange): MemoChange[] {
  return [...stack, change].slice(-MEMO_UNDO_LIMIT);
}

/**
 * Pops the newest change whose tile is still face down. Flipping a tile clears
 * its flags, so an entry for a tile that has since been flipped has nothing
 * left to undo and is dropped on the way.
 */
export function popMemo(
  stack: readonly MemoChange[],
  isFaceDown: (row: number, col: number) => boolean,
): { stack: MemoChange[]; change: MemoChange | null } {
  const rest = [...stack];
  while (rest.length > 0) {
    const change = rest.pop();
    if (change && isFaceDown(change.row, change.col)) return { stack: rest, change };
  }
  return { stack: [], change: null };
}

type UndoKeyEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

/** Ctrl+Z or Cmd+Z. Shift (redo) and Alt chords are not ours. */
export function isUndoKey(e: UndoKeyEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z";
}
