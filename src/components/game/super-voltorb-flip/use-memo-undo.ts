"use client";
import { useCallback, useRef, useState } from "react";
import type { VoltorbFlip } from "./engine";
import { popMemo, pushMemo, type MemoChange } from "./memo-undo";

/**
 * The memo undo history. It lives in the parent (not in Gameboard) so the main
 * game and the Daily board share one instance, and it is a ref plus a counter
 * so `undo` can pop synchronously without waiting for a render.
 */
export function useMemoUndo() {
  const stackRef = useRef<MemoChange[]>([]);
  const [count, setCount] = useState(0);

  const record = useCallback((change: MemoChange) => {
    stackRef.current = pushMemo(stackRef.current, change);
    setCount(stackRef.current.length);
  }, []);

  const reset = useCallback(() => {
    stackRef.current = [];
    setCount(0);
  }, []);

  /** Undoes the newest still-undoable change on `game`; false when there was none. */
  const undo = useCallback(
    (game: VoltorbFlip, updateGame: (cb: (g: VoltorbFlip) => void) => void): boolean => {
      const { stack, change } = popMemo(
        stackRef.current,
        (row, col) => game.cells[row]?.[col]?.isFlipped === false,
      );
      stackRef.current = stack;
      setCount(stack.length);
      if (!change) return false;
      // flagCell is a toggle, so the same call undoes the change.
      updateGame((g) => g.flagCell(change.row, change.col, change.flag));
      return true;
    },
    [],
  );

  return { canUndo: count > 0, record, undo, reset };
}
