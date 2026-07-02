import type { Cell, CellValue, RowColValues, GameStatus } from "./types";

// ---------------------------------------------------------------------------
// src/utils/helpers.ts (1:1).
// ---------------------------------------------------------------------------

export const indexToCoordinate = (index: number, gridSize = 5): [number, number] => {
  const x = Math.floor(index / gridSize);
  const y = index % gridSize;
  return [x, y];
};

// ---------------------------------------------------------------------------
// src/game/Level.ts (1:1).
// ---------------------------------------------------------------------------

// Size-aware, level-aware tile distribution generator. Replaces the hand-
// authored 5x5 LEVELS tables with a formula that's valid for N = 2..10.
//
// Shape of the curve (tuned to roughly match HG/SS at N=5):
//   voltorb density:  22% -> 42%  across levels 1..8
//   valuable density: 16% -> 38%  across levels 1..8
//   x3 share of val:  25% -> 60%  across levels 1..8
// Then hard caps on x2/x3 counts prevent the multiplicative max score from
// exploding on large boards. Caps scale with level only:
//   maxX3(L) = 1 + L                (1 .. 8)
//   maxX2(L) = 2 + floor(L * 1.5)   (2 .. 12)
export function generateLevelComposition(level: number, boardSize: number) {
  const L = Math.max(0, Math.min(7, level));
  const total = boardSize * boardSize;
  const t = L / 7;
  const vFrac = 0.22 + t * 0.20;
  const valFrac = 0.16 + t * 0.22;
  const x3Share = 0.25 + t * 0.35;

  let v = Math.max(1, Math.round(vFrac * total));
  let val = Math.max(1, Math.round(valFrac * total));
  // Keep at least one "1" tile so the player has safe information-gathering
  // moves; otherwise every flip is score-or-bomb.
  if (v + val >= total) val = Math.max(1, total - v - 1);
  if (v + val >= total) v = Math.max(1, total - val - 1);

  const maxX3 = Math.min(total, 1 + L);
  const maxX2 = Math.min(total, 2 + Math.floor(L * 1.5));
  let x3 = Math.min(maxX3, Math.round(val * x3Share));
  let x2 = Math.max(0, Math.min(maxX2, val - x3));
  if (x2 + x3 === 0) x3 = 1;

  // Small +/-1 jitter per instance so the same (L, N) pair isn't identical
  // every run — preserves the per-level variety that the old LEVELS variants
  // provided.
  const jitter = () => ((Math.random() * 3) | 0) - 1; // -1, 0, 1
  x2 = Math.max(0, Math.min(maxX2, x2 + jitter()));
  x3 = Math.max(0, Math.min(maxX3, x3 + jitter()));
  v = Math.max(1, v + jitter());
  if (x2 + x3 === 0) x3 = 1;
  // Re-clamp after jitter in case we now overflow the board.
  if (x2 + x3 + v >= total) v = Math.max(1, total - x2 - x3 - 1);
  if (x2 + x3 + v >= total) val = Math.max(1, total - v - 1);

  return { x2, x3, v };
}

export class Level {
  private _x2: number;
  private _x3: number;
  private _voltorbs: number;

  constructor(level: number, size: number = 5) {
    const c = generateLevelComposition(level, size);
    this._x2 = c.x2;
    this._x3 = c.x3;
    this._voltorbs = c.v;
  }

  get levelData() {
    return {
      x2: this._x2,
      x3: this._x3,
      voltorbs: this._voltorbs,
      // coins is no longer load-bearing (Board computes maxLevelScore from
      // the actual placed tiles) but keep the shape for backward compat.
      coins: Math.pow(2, this._x2) * Math.pow(3, this._x3),
    };
  }
}

// ---------------------------------------------------------------------------
// src/game/Board.ts (1:1 — uses a Fisher–Yates shuffle in place of lodash).
// ---------------------------------------------------------------------------

export function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class Board {
  private _board: Cell[][];
  private _flippedCells: number;
  private _maxLevelScore: number;
  private _rowValues: RowColValues[];
  private _colValues: RowColValues[];
  private _size: number;

  constructor(level: Level, size: number = 5) {
    this._size = size;
    this._rowValues = Array(size)
      .fill(0)
      .map(() => ({ coins: 0, voltorbs: 0 }));
    this._colValues = Array(size)
      .fill(0)
      .map(() => ({ coins: 0, voltorbs: 0 }));
    this._maxLevelScore = 0;
    this._board = this.createBoard(level);
    this._flippedCells = 0;
  }

  public flagCell(row: number, col: number, flag: CellValue): void {
    const cell: Cell = this._board[row][col];
    if (cell.isFlipped) return;

    cell.flags[flag] = !cell.flags[flag];
    cell.isFlagged = Object.values(cell.flags).some((value) => value === true);
  }

  public flipCell(row: number, col: number): CellValue {
    if (
      row < 0 ||
      row >= this._board.length ||
      col < 0 ||
      col >= this._board[0].length
    ) {
      throw new Error(`Invalid row or column: (${row}, ${col})`);
    }

    const cell: Cell = this._board[row][col];
    if (cell.isFlipped) {
      return 1;
    } else {
      if (cell.value !== "V") this._flippedCells += 1;
      cell.isFlipped = true;
      cell.flags = { 1: false, 2: false, 3: false, V: false };
    }
    return cell.value;
  }

  private createBoard(level: Level) {
    const size = this._size;
    const total = size * size;
    const board: Cell[][] = [...Array(size)].map(() =>
      Array.from({ length: size }),
    );
    // Level is already size-aware — counts fit the board by construction.
    const { x2: scaledX2, x3: scaledX3, voltorbs: scaledV } = level.levelData;

    const levelValuesArray: CellValue[] = [
      ...Array(scaledX2).fill(2),
      ...Array(scaledX3).fill(3),
      ...Array(scaledV).fill("V"),
    ];
    const remainingFillArray: 1[] = Array(
      total - levelValuesArray.length,
    ).fill(1);
    const shuffledValuesArray: CellValue[] = shuffle([
      ...levelValuesArray,
      ...remainingFillArray,
    ]);

    let index = 0;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const cell = {
          value: shuffledValuesArray[index],
          flags: { 1: false, 2: false, 3: false, V: false },
          isFlagged: false,
          isFlipped: false,
        } as Cell;

        if (cell.value === "V") {
          this._rowValues[row].voltorbs += 1;
          this._colValues[col].voltorbs += 1;
        } else {
          this._rowValues[row].coins += cell.value;
          this._colValues[col].coins += cell.value;
        }

        board[row][col] = cell;
        index++;
      }
    }
    // Win threshold = product of every non-1 tile. Ignoring the authored
    // level.coins value (which is 5x5-only) keeps every board winnable even
    // after the area-scaling above rounds counts down.
    this._maxLevelScore = Math.pow(2, scaledX2) * Math.pow(3, scaledX3);
    return board;
  }

  get cells() {
    return this._board;
  }

  get flippedCells() {
    return this._flippedCells;
  }

  get rowValues() {
    return this._rowValues;
  }

  get colValues() {
    return this._colValues;
  }

  get maxLevelScore() {
    return this._maxLevelScore;
  }
}

// ---------------------------------------------------------------------------
// src/game/VoltorbFlip.ts (1:1).
// ---------------------------------------------------------------------------

export class VoltorbFlip {
  private _board: Board;
  private _totalScore: number;
  private _currentScore: number;
  private _currentLevel: number;
  private _level: Level;
  private _gameStatus: GameStatus;
  private _size: number;

  constructor(size: number = 5) {
    this._size = size;
    this._level = new Level(0, this._size);
    this._currentLevel = 0;
    this._currentScore = 0;
    this._totalScore = 0;
    this._gameStatus = "playing";
    this._board = new Board(this._level, this._size);
  }

  public toggleMemo() {
    this._gameStatus = this._gameStatus === "playing" ? "memo" : "playing";
  }

  public flagCell(row: number, col: number, flag: CellValue): void {
    this._board.flagCell(row, col, flag);
  }

  public flipCell(row: number, col: number): void {
    const cellValue = this._board.flipCell(row, col);

    if (cellValue === "V") {
      if (this._board.flippedCells < this._currentLevel) {
        this._currentLevel = this._board.flippedCells;
      }
      this._gameStatus = "lose";
      return;
    }
    this._currentScore =
      this._currentScore === 0 ? cellValue : this._currentScore * cellValue;

    if (this._currentScore === this._board.maxLevelScore) {
      this._currentLevel = Math.min(this._currentLevel + 1, 8);
      this._totalScore += this._currentScore;
      this._gameStatus = "win";
    }
  }

  public restartGame(): void {
    this._gameStatus = "playing";
    this._currentScore = 0;
    this._level = new Level(this._currentLevel, this._size);
    this._board = new Board(this._level, this._size);
  }

  // Dev-only shortcut: force a win for the current level. Bumps score by the
  // remaining coins-to-win and advances to the next level, mirroring what
  // flipCell does when the last valuable tile is hit.
  public debugWinLevel(): void {
    const target = this._board.maxLevelScore;
    const bonus = Math.max(0, target - Math.max(1, this._currentScore));
    this._currentScore = target;
    this._totalScore += bonus;
    this._currentLevel = Math.min(this._currentLevel + 1, 8);
    this._gameStatus = "win";
  }

  get cells() {
    return this._board.cells;
  }

  get rowValues() {
    return this._board.rowValues;
  }

  get colValues() {
    return this._board.colValues;
  }

  get gameStatus() {
    return this._gameStatus;
  }

  get currentScore() {
    return this._currentScore;
  }

  get totalScore() {
    return this._totalScore;
  }

  get currentLevel() {
    return this._currentLevel + 1;
  }
}

// Deep-clone the game state and reattach prototypes. structuredClone
// strips prototypes (and instanceof checks can fail across HMR reloads
// where the class identity changes), so we rely on well-known property
// names instead of instanceof.
export function cloneGame(g: VoltorbFlip): VoltorbFlip {
  const deepClone: <T>(x: T) => T =
    typeof structuredClone === "function"
      ? structuredClone
      : (x) => JSON.parse(JSON.stringify(x));

  const src = g as unknown as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const k of Object.keys(src)) {
    data[k] = deepClone(src[k]);
  }
  Object.setPrototypeOf(data, VoltorbFlip.prototype);

  const boardLike = data._board as Record<string, unknown> | undefined;
  if (boardLike) Object.setPrototypeOf(boardLike, Board.prototype);

  const levelLike = data._level as Record<string, unknown> | undefined;
  if (levelLike) Object.setPrototypeOf(levelLike, Level.prototype);

  return data as unknown as VoltorbFlip;
}
