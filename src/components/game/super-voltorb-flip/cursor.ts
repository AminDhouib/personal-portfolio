import type { MemoFlag } from "./memo-button";

export type Cursor = { row: number; col: number };

const CURSOR_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"] as const;
export type CursorKey = (typeof CURSOR_KEYS)[number];

export function isCursorKey(key: string): key is CursorKey {
  return (CURSOR_KEYS as readonly string[]).includes(key);
}

function clamp(value: number, n: number): number {
  return Math.max(0, Math.min(n - 1, value));
}

/** The tile the cursor lands on for `key` on an n x n board. Edges clamp. */
export function moveCursor(cursor: Cursor, key: CursorKey, n: number): Cursor {
  switch (key) {
    case "ArrowUp":
      return { row: clamp(cursor.row - 1, n), col: cursor.col };
    case "ArrowDown":
      return { row: clamp(cursor.row + 1, n), col: cursor.col };
    case "ArrowLeft":
      return { row: cursor.row, col: clamp(cursor.col - 1, n) };
    case "ArrowRight":
      return { row: cursor.row, col: clamp(cursor.col + 1, n) };
    case "Home":
      return { row: cursor.row, col: 0 };
    case "End":
      return { row: cursor.row, col: n - 1 };
  }
}

/** The memo flag a key toggles on the tile under the cursor, or null. */
export function memoKeyFlag(key: string): MemoFlag | null {
  if (key === "1") return 1;
  if (key === "2") return 2;
  if (key === "3") return 3;
  if (key === "v" || key === "V") return "V";
  return null;
}
