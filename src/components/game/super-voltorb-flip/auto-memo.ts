import { EMPTY_MEMOS, type Tile, type LineHint, type MemoMarks } from "./types";

/**
 * Smart Auto-Memo engine.
 * Given the board state + hints, returns a 5x5 grid of memo marks inferred
 * via simple logical deduction on each row and column.
 *
 * Memo index: [voltorb?, one?, two?, three?]
 * Convention: `true` means "this value is possible for this tile".
 * A flipped tile gets all-false memos (irrelevant).
 *
 * Deductions handled (baseline cases):
 *  1. Line with 0 voltorbs → no tile in it is a voltorb (memos[0] stays false).
 *  2. Line with all-ones (points equals unflipped tile count, 0 voltorbs) → memos[1] = true, others false.
 *  3. Line where remaining voltorbs fill all unflipped tiles → every unflipped is a voltorb.
 */
export function deduceAll(
  board: Tile[][],
  rowHints: LineHint[],
  colHints: LineHint[],
): MemoMarks[][] {
  // Initialize memos: all possibilities open for unflipped tiles,
  // all-false for flipped tiles.
  const memos: boolean[][][] = board.map((row) =>
    row.map((t) =>
      t.flipped
        ? [false, false, false, false]
        : [true, true, true, true],
    ),
  );

  const applyLine = (
    hint: LineHint,
    getTile: (i: number) => { tile: Tile; r: number; c: number },
  ) => {
    let unflipped = 0;
    let knownPoints = 0;
    let knownVoltorbs = 0;
    for (let i = 0; i < 5; i++) {
      const { tile } = getTile(i);
      if (!tile.flipped) {
        unflipped++;
      } else {
        if (tile.value === 0) knownVoltorbs++;
        else knownPoints += tile.value;
      }
    }
    const remainingPoints = hint.points - knownPoints;
    const remainingVoltorbs = hint.voltorbs - knownVoltorbs;

    // Case 1: no voltorbs remaining → rule out voltorb for every unflipped tile.
    if (remainingVoltorbs === 0) {
      for (let i = 0; i < 5; i++) {
        const { tile, r, c } = getTile(i);
        if (!tile.flipped) memos[r][c][0] = false;
      }
    }

    // Case 2: all remaining unflipped must be voltorbs
    if (remainingVoltorbs === unflipped) {
      for (let i = 0; i < 5; i++) {
        const { tile, r, c } = getTile(i);
        if (!tile.flipped) {
          memos[r][c][0] = true;
          memos[r][c][1] = false;
          memos[r][c][2] = false;
          memos[r][c][3] = false;
        }
      }
    }

    // Case 3: non-voltorb unflipped tiles must all be value 1
    const unflippedNonVoltorbs = unflipped - remainingVoltorbs;
    if (unflippedNonVoltorbs > 0 && remainingPoints === unflippedNonVoltorbs) {
      for (let i = 0; i < 5; i++) {
        const { tile, r, c } = getTile(i);
        if (tile.flipped) continue;
        if (memos[r][c][0]) continue; // might be a voltorb — skip
        memos[r][c][1] = true;
        memos[r][c][2] = false;
        memos[r][c][3] = false;
      }
    }
  };

  for (let r = 0; r < 5; r++) {
    applyLine(rowHints[r], (i) => ({ tile: board[r][i], r, c: i }));
  }
  for (let c = 0; c < 5; c++) {
    applyLine(colHints[c], (i) => ({ tile: board[i][c], r: i, c }));
  }

  return memos.map((row) =>
    row.map((m) => [m[0], m[1], m[2], m[3]] as MemoMarks),
  );
}

export { EMPTY_MEMOS };
