"use client";

/**
 * Super Voltorb Flip — 1:1 port of https://github.com/jv-vogler/voltorb-flip
 * Copyright (c) 2023 João Vogler. Licensed under MIT.
 * See upstream LICENSE (https://github.com/jv-vogler/voltorb-flip/blob/main/LICENSE).
 *
 * Modifications by <amin dhouib@outlook.com>:
 * - Next.js 16 / portfolio codebase integration
 * - Inline SVG voltorb icon instead of upstream Pokémon sprite PNGs
 *   (those are Nintendo IP not redistributed under upstream's MIT).
 * - Fonts shipped under public/games/voltorb-flip/fonts/ with LICENSE.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import localFont from "next/font/local";
import { EffectsProvider, useEffectsTheme } from "./super-voltorb-flip/effects/context";
import {
  sfx,
  playMusic,
  stopMusic,
  fadeOutMusic,
  playGameOver,
  stopGameOver,
  playLevelWin,
  stopLevelWin,
  setMusicMuted,
} from "./super-voltorb-flip/audio";
import { useMute } from "./super-voltorb-flip/use-mute";
import { MemoPanel } from "./super-voltorb-flip/memo-button";

// ---------------------------------------------------------------------------
// Fonts — 1:1 with upstream (pokemon-ds-font / m5x7 / stacked-pixel).
// ---------------------------------------------------------------------------

const pokemonFont = localFont({
  src: "../../../public/games/voltorb-flip/fonts/pokemon-ds-font.ttf",
  variable: "--font-voltorb-ds",
  display: "swap",
});
const numberFont = localFont({
  src: "../../../public/games/voltorb-flip/fonts/m5x7.ttf",
  variable: "--font-voltorb-m5x7",
  display: "swap",
});
const scoreFont = localFont({
  src: "../../../public/games/voltorb-flip/fonts/stacked-pixel.ttf",
  variable: "--font-voltorb-stacked",
  display: "swap",
});

// ---------------------------------------------------------------------------
// src/utils/constants.ts — COLORS and LEVELS table (1:1).
// ---------------------------------------------------------------------------

const COLORS: string[] = [
  "#e77352",
  "#5eae43",
  "#efa539",
  "#3194ff",
  "#c872e7",
];

type LevelData = {
  x2: number;
  x3: number;
  voltorbs: number;
  coins: number;
};

const LEVELS: LevelData[][] = [
  // Level 1
  [
    { x2: 3, x3: 1, voltorbs: 6, coins: 24 },
    { x2: 0, x3: 3, voltorbs: 6, coins: 27 },
    { x2: 5, x3: 0, voltorbs: 6, coins: 32 },
    { x2: 2, x3: 2, voltorbs: 6, coins: 36 },
    { x2: 4, x3: 1, voltorbs: 6, coins: 48 },
  ],
  // Level 2
  [
    { x2: 1, x3: 3, voltorbs: 7, coins: 54 },
    { x2: 6, x3: 0, voltorbs: 7, coins: 64 },
    { x2: 3, x3: 2, voltorbs: 7, coins: 72 },
    { x2: 0, x3: 4, voltorbs: 7, coins: 81 },
    { x2: 5, x3: 1, voltorbs: 7, coins: 96 },
  ],
  // Level 3
  [
    { x2: 2, x3: 3, voltorbs: 8, coins: 108 },
    { x2: 7, x3: 0, voltorbs: 8, coins: 128 },
    { x2: 4, x3: 2, voltorbs: 8, coins: 144 },
    { x2: 1, x3: 4, voltorbs: 8, coins: 162 },
    { x2: 6, x3: 1, voltorbs: 8, coins: 192 },
  ],
  // Level 4
  [
    { x2: 3, x3: 3, voltorbs: 8, coins: 216 },
    { x2: 0, x3: 5, voltorbs: 8, coins: 243 },
    { x2: 8, x3: 0, voltorbs: 10, coins: 256 },
    { x2: 5, x3: 2, voltorbs: 10, coins: 288 },
    { x2: 2, x3: 4, voltorbs: 10, coins: 324 },
  ],
  // Level 5
  [
    { x2: 7, x3: 1, voltorbs: 10, coins: 384 },
    { x2: 4, x3: 3, voltorbs: 10, coins: 432 },
    { x2: 1, x3: 5, voltorbs: 10, coins: 486 },
    { x2: 9, x3: 0, voltorbs: 10, coins: 512 },
    { x2: 6, x3: 2, voltorbs: 10, coins: 576 },
  ],
  // Level 6
  [
    { x2: 3, x3: 4, voltorbs: 10, coins: 648 },
    { x2: 0, x3: 6, voltorbs: 10, coins: 729 },
    { x2: 8, x3: 1, voltorbs: 10, coins: 768 },
    { x2: 5, x3: 3, voltorbs: 10, coins: 864 },
    { x2: 2, x3: 5, voltorbs: 10, coins: 972 },
  ],
  // Level 7
  [
    { x2: 7, x3: 2, voltorbs: 10, coins: 1152 },
    { x2: 4, x3: 4, voltorbs: 10, coins: 1296 },
    { x2: 1, x3: 6, voltorbs: 13, coins: 1458 },
    { x2: 9, x3: 1, voltorbs: 13, coins: 1536 },
    { x2: 6, x3: 3, voltorbs: 10, coins: 1728 },
  ],
  // Level 8
  [
    { x2: 0, x3: 7, voltorbs: 10, coins: 2187 },
    { x2: 8, x3: 2, voltorbs: 10, coins: 2304 },
    { x2: 5, x3: 4, voltorbs: 10, coins: 2592 },
    { x2: 2, x3: 6, voltorbs: 10, coins: 2916 },
    { x2: 7, x3: 3, voltorbs: 10, coins: 3456 },
  ],
];

// ---------------------------------------------------------------------------
// src/utils/helpers.ts (1:1).
// ---------------------------------------------------------------------------

const indexToCoordinate = (index: number, gridSize = 5): [number, number] => {
  const x = Math.floor(index / gridSize);
  const y = index % gridSize;
  return [x, y];
};

// ---------------------------------------------------------------------------
// src/game/Level.ts (1:1).
// ---------------------------------------------------------------------------

class Level {
  private _x2: number;
  private _x3: number;
  private _voltorbs: number;
  private _coins: number;

  constructor(level: number) {
    const currentLevel = LEVELS[level][Math.floor(Math.random() * 5)];
    this._x2 = currentLevel.x2;
    this._x3 = currentLevel.x3;
    this._voltorbs = currentLevel.voltorbs;
    this._coins = currentLevel.coins;
  }

  get levelData() {
    return {
      x2: this._x2,
      x3: this._x3,
      voltorbs: this._voltorbs,
      coins: this._coins,
    };
  }
}

// ---------------------------------------------------------------------------
// src/game/Board.ts (1:1 — uses a Fisher–Yates shuffle in place of lodash).
// ---------------------------------------------------------------------------

type FlagValues = { 1: boolean; 2: boolean; 3: boolean; V: boolean };

type CellValue = 1 | 2 | 3 | "V";

type Cell = {
  value: CellValue;
  flags: FlagValues;
  isFlipped: boolean;
  isFlagged: boolean;
};

type RowColValues = {
  coins: number;
  voltorbs: number;
};

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

class Board {
  private _board: Cell[][];
  private _flippedCells: number;
  private _maxLevelScore: number;
  private _rowValues: RowColValues[];
  private _colValues: RowColValues[];

  constructor(level: Level) {
    this._rowValues = Array(5)
      .fill(0)
      .map(() => ({ coins: 0, voltorbs: 0 }));
    this._colValues = Array(5)
      .fill(0)
      .map(() => ({ coins: 0, voltorbs: 0 }));
    this._board = this.createBoard(level);
    this._flippedCells = 0;
    this._maxLevelScore = level.levelData.coins;
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
    const board: Cell[][] = [...Array(5)].map(() => Array.from({ length: 5 }));
    const { x2, x3, voltorbs } = level.levelData;

    const levelValuesArray: CellValue[] = [
      ...Array(x2).fill(2),
      ...Array(x3).fill(3),
      ...Array(voltorbs).fill("V"),
    ];
    const remainingFillArray: 1[] = Array(25 - levelValuesArray.length).fill(1);
    const shuffledValuesArray: CellValue[] = shuffle([
      ...levelValuesArray,
      ...remainingFillArray,
    ]);

    let index = 0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
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

type GameStatus = "playing" | "win" | "lose" | "memo";

class VoltorbFlip {
  private _board: Board;
  private _totalScore: number;
  private _currentScore: number;
  private _currentLevel: number;
  private _level: Level;
  private _gameStatus: GameStatus;

  constructor() {
    this._level = new Level(0);
    this._currentLevel = 0;
    this._currentScore = 0;
    this._totalScore = 0;
    this._gameStatus = "playing";
    this._board = new Board(this._level);
  }

  public toggleMemo() {
    this._gameStatus === "playing"
      ? (this._gameStatus = "memo")
      : (this._gameStatus = "playing");
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
    this._currentScore === 0
      ? (this._currentScore = cellValue)
      : (this._currentScore *= cellValue);

    if (this._currentScore === this._board.maxLevelScore) {
      this._currentLevel = Math.min(this._currentLevel + 1, 8);
      this._totalScore += this._currentScore;
      this._gameStatus = "win";
    }
  }

  public restartGame(): void {
    this._gameStatus = "playing";
    this._currentScore = 0;
    this._level = new Level(this._currentLevel);
    this._board = new Board(this._level);
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
function cloneGame(g: VoltorbFlip): VoltorbFlip {
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

// ---------------------------------------------------------------------------
// src/hooks/useGame.tsx (1:1, with cloneGame replacing lodash's cloneDeep).
// ---------------------------------------------------------------------------

const useGame = () => {
  const [game, setGame] = useState<VoltorbFlip>();

  useEffect(() => {
    setGame(new VoltorbFlip());
  }, []);

  function updateGame(callback: (game: VoltorbFlip) => void): void {
    if (!game) return;
    const newGame = cloneGame(game);
    callback(newGame);
    setGame(newGame);
  }

  return { game, updateGame };
};

// ---------------------------------------------------------------------------
// Inline SVG voltorb — substitutes upstream's `voltorb.png` / `voltorb-flip.png`
// (Nintendo IP we can't redistribute). Red-top, white-bottom face ball.
// ---------------------------------------------------------------------------

// Upstream sprite (28x28 PNG, mirrored into /public from jv-vogler/voltorb-flip).
function VoltorbIcon({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/games/super-voltorb-flip/sprites/upstream/voltorb.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={className}
      style={{ display: "block", imageRendering: "pixelated" }}
    />
  );
}

// ---------------------------------------------------------------------------
// Inlined utility styles (from upstream src/styles/globals.css and
// tailwind.config.js). Rendered once on mount and scoped by class name so
// we don't pollute the global stylesheet across the portfolio.
// ---------------------------------------------------------------------------

const SCOPED_STYLES = `
.svf-root {
  --svf-tile: 40px;
  --svf-gap: 16px;
}
@media (max-width: 639px) {
  .svf-root { --svf-tile: 44px; --svf-gap: 14px; }
}
@media (max-width: 359px) {
  .svf-root { --svf-tile: 36px; --svf-gap: 12px; }
}
.svf-root { font-family: var(--font-voltorb-ds), ui-monospace, monospace; color: #fff; background-color: #58a66c; }
.svf-root *, .svf-root *::before, .svf-root *::after { box-sizing: border-box; text-rendering: geometricPrecision; }
.svf-root .text-shadow-white {
  text-shadow: 2px 0 #fff, -2px 0 #fff, 0 2px #fff, 0 -2px #fff, 1px 1px #fff,
    -1px -1px #fff, 1px -1px #fff, -1px 1px #fff;
}
.svf-root .picture-outline {
  -webkit-filter: drop-shadow(1px 1px white) drop-shadow(-1px -1px white)
    drop-shadow(1px -1px white) drop-shadow(-1px 1px white);
  filter: drop-shadow(1px 1px white) drop-shadow(-1px -1px white)
    drop-shadow(1px -1px white) drop-shadow(-1px 1px white);
}
.svf-root .voltorb { height: 28px; width: 28px; }
.svf-root .rounded-5 { border-radius: 5px; }
.svf-root .drop-shadow-default {
  filter: drop-shadow(1px 1px 0 rgba(0,0,0,1)) drop-shadow(1px 1px 0 rgba(75,85,99,1));
}
.svf-root .drop-shadow-soft {
  filter: drop-shadow(1px 1px 0 rgba(75,85,99,.25)) drop-shadow(2px 2px 0 rgba(75,85,99,.25));
}
/* Row/col colored connector bars linking adjacent tiles (matches Pokémon HG/SS).
   Gap between tile wrappers is 16px; we center the bar at +8 (the midpoint).
   Tile outline is 4px, so bar overlaps each adjacent tile's outline by a few
   pixels to sit flush against the tile bodies like the reference. */
/* Bars span slightly past the 16px gap so their ends tuck under each
   adjacent tile/clue-card outline (z-index 0 keeps them behind the tile
   bodies — the reference shows the bar visually ending inside the frame). */
.svf-root .svf-conn-e {
  position: absolute;
  right: calc(-1 * var(--svf-gap) - 1px);
  top: 50%;
  width: calc(var(--svf-gap) + 2px);
  height: 8px;
  transform: translateY(-50%);
  z-index: 0;
  pointer-events: none;
  box-shadow: 0 1px 0 #e5e7eb, 0 -1px 0 #e5e7eb;
}
.svf-root .svf-conn-s {
  position: absolute;
  bottom: calc(-1 * var(--svf-gap) - 1px);
  left: 50%;
  height: calc(var(--svf-gap) + 2px);
  width: 8px;
  transform: translateX(-50%);
  z-index: 0;
  pointer-events: none;
  box-shadow: 1px 0 0 #e5e7eb, -1px 0 0 #e5e7eb;
}
/* Cursor/hover selection — matches the red frame on the active tile in HG/SS.
   Two overlapping shadows give the pixel-art look: dark inner hairline +
   solid red outside. */
.svf-root .svf-tile-wrap::before {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: 3px;
  box-shadow: 0 0 0 1px #6a0a0a, 0 0 0 4px #ef2020;
  opacity: 0;
  transition: opacity 80ms ease-out;
  pointer-events: none;
  z-index: 3;
}
.svf-root .svf-tile-wrap:hover::before,
.svf-root .svf-tile-wrap:focus-visible::before {
  opacity: 1;
}
.svf-root .svf-coin {
  image-rendering: pixelated;
  shape-rendering: crispEdges;
  animation: svf-coin-spin 1.3s steps(1, end) infinite;
  transform-origin: center center;
}
.svf-root .svf-modal-backdrop {
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(1px);
}
.svf-root .svf-modal-open {
  animation: svf-modal-backdrop-in 220ms ease-out both;
}
.svf-root .svf-modal-open .svf-modal-card {
  animation: svf-modal-card-in 320ms cubic-bezier(0.22, 1.4, 0.36, 1) both;
}
.svf-root .svf-modal-closing {
  animation: svf-modal-backdrop-out 180ms ease-in both;
}
.svf-root .svf-modal-closing .svf-modal-card {
  animation: svf-modal-card-out 180ms ease-in both;
}
@keyframes svf-modal-backdrop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes svf-modal-backdrop-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes svf-modal-card-in {
  0%   { transform: translateY(-18px) scale(0.92); opacity: 0; }
  60%  { transform: translateY(4px)   scale(1.02); opacity: 1; }
  100% { transform: translateY(0)     scale(1);    opacity: 1; }
}
@keyframes svf-modal-card-out {
  from { transform: scale(1);    opacity: 1; }
  to   { transform: scale(0.92); opacity: 0; }
}
@keyframes svf-coin-spin {
  0%   { transform: scaleX(1);    }
  16%  { transform: scaleX(0.7);  }
  32%  { transform: scaleX(0.25); }
  48%  { transform: scaleX(-0.4); }
  64%  { transform: scaleX(-0.9); }
  80%  { transform: scaleX(-0.4); }
  100% { transform: scaleX(1);    }
}
@media (prefers-reduced-motion: reduce) {
  .svf-root * { transition-duration: 150ms !important; animation-duration: 150ms !important; }
}
`;

// ---------------------------------------------------------------------------
// src/components/Card.tsx (1:1 port).
// ---------------------------------------------------------------------------

type CardProps = {
  children: React.ReactNode;
  fake?: boolean;
  isFlipped?: boolean;
  flipCard?: React.MouseEventHandler<HTMLDivElement>;
  row?: number;
  col?: number;
  flags?: FlagValues;
};

const Card = ({ children, fake, isFlipped, flipCard, row, col, flags }: CardProps) => {
  const rowColor = row !== undefined ? COLORS[row] : undefined;
  const colColor = col !== undefined ? COLORS[col] : undefined;
  return fake ? (
    <div className="relative box-content flex h-[var(--svf-tile)] w-[var(--svf-tile)] select-none rounded-sm border-2 border-gray-700 outline outline-4 outline-gray-200">
      <div
        className={`${numberFont.className} text-shadow-white flex h-full w-full place-content-center place-items-center border-2 border-[#a55a52] bg-[#bd8c84] text-3xl font-bold text-black`}
      >
        {children}
      </div>
    </div>
  ) : (
    <div
      className="svf-tile-wrap relative h-[var(--svf-tile)] w-[var(--svf-tile)] cursor-pointer place-self-center [perspective:1000px]"
      role="button"
      tabIndex={0}
      aria-label={row !== undefined && col !== undefined ? `Row ${row + 1}, Col ${col + 1}, ${isFlipped ? "revealed" : "face down"}` : undefined}
      onClick={flipCard}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") flipCard?.(e as unknown as React.MouseEvent<HTMLDivElement>); }}
    >
      {rowColor && <div className="svf-conn-e" style={{ backgroundColor: rowColor }} />}
      {colColor && <div className="svf-conn-s" style={{ backgroundColor: colColor }} />}
      <div
        className="relative box-content flex h-[var(--svf-tile)] w-[var(--svf-tile)] select-none rounded-sm border-2 border-gray-700 outline outline-4 outline-gray-200 transition-all duration-500 [transform-style:preserve-3d] [backface-visibility:hidden]"
        style={{ transform: `${isFlipped ? "rotateY(180deg)" : "none"}` }}
      >
        <div
          className={`${numberFont.className} text-shadow-white flex h-full w-full place-content-center place-items-center rounded-sm border-2 border-black bg-[#bd8c84] text-3xl font-bold text-black outline outline-4 outline-gray-200 [backface-visibility:hidden] [transform:rotateY(180deg)]`}
        >
          <div className="flex h-full w-full items-center justify-center border-2 border-[#8a4236]">
            {children}
          </div>
        </div>
        <div className="absolute inset-0 grid h-full w-full grid-cols-3 bg-white">
          <div className="h-full w-full bg-[#448563]"></div>
          <div className="h-full w-full bg-[#58a66c]"></div>
          <div className="h-full w-full bg-[#448563]"></div>
          <div className="h-full w-full bg-[#58a66c]"></div>
          <div className="h-full w-full bg-[#448563]"></div>
          <div className="h-full w-full bg-[#58a66c]"></div>
          <div className="h-full w-full bg-[#448563]"></div>
          <div className="h-full w-full bg-[#58a66c]"></div>
          <div className="h-full w-full bg-[#448563]"></div>
        </div>
        {flags && (
          <div className="pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-2">
            {([1, 2, 3, "V"] as const).map((f, i) =>
              flags[f] ? (
                <div
                  key={f}
                  className={[
                    "flex",
                    i === 0 ? "items-start justify-start" :
                    i === 1 ? "items-start justify-end" :
                    i === 2 ? "items-end justify-start" :
                              "items-end justify-end",
                  ].join(" ")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/games/super-voltorb-flip/sprites/upstream/memo/${f === "V" ? 0 : (f as number) - 1}.png`}
                    width={14}
                    height={14}
                    alt=""
                    style={{ imageRendering: "pixelated" }}
                  />
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// src/components/RowColCard.tsx (1:1 port).
// ---------------------------------------------------------------------------

type RowColCardProps = {
  coins: number;
  voltorbs: number;
  index: number;
};

const RowColCard = ({ coins, voltorbs, index }: RowColCardProps) => {
  return (
    <div
      className={`${numberFont.className} relative z-[5] box-content flex h-[var(--svf-tile)] w-[var(--svf-tile)] select-none flex-col rounded-sm outline outline-4 outline-gray-200`}
    >
      <div
        className={`relative flex h-full w-full flex-col place-content-center place-items-center text-3xl font-bold text-gray-800`}
        style={{ backgroundColor: COLORS[index] }}
      >
        <div className="absolute top-[-11px] right-[-3px] text-end tracking-widest">
          {coins.toString().padStart(2, "0")}
        </div>
        <div className="absolute top-[20px] w-full outline outline-2 outline-gray-200"></div>
        <div className="absolute bottom-[-6px] flex items-center gap-0.5">
          <VoltorbIcon
            size={28}
            className="voltorb translate-y-1.5 object-contain"
          />
          <p className="translate-x-0.5">{voltorbs}</p>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// src/components/Gameboard.tsx (1:1 port).
// ---------------------------------------------------------------------------

type GameboardProps = {
  game: VoltorbFlip;
  updateGame: (callback: (game: VoltorbFlip) => void) => void;
  waitForClick: boolean;
  muted: boolean;
  onFirstInteraction: () => void;
  memoMode: boolean;
  memoFlag: 1 | 2 | 3 | "V";
};

type ActiveEffect = { id: number; kind: "bomb" | "coin"; row: number; col: number; onDone: () => void };

const Gameboard = ({ game, updateGame, waitForClick, muted, onFirstInteraction, memoMode, memoFlag }: GameboardProps) => {
  const [cardsFlipped, setCardsFlipped] = useState<{ isFlipped: boolean }[]>(
    game.cells.flat().map((cell) => ({ isFlipped: cell.isFlipped })),
  );
  const [effects, setEffects] = useState<ActiveEffect[]>([]);
  const theme = useEffectsTheme();
  const nextId = useRef(0);

  async function waitForUserInteraction() {
    return new Promise<void>((resolve) => {
      const handleClick = () => {
        resolve();
        document.removeEventListener("click", handleClick);
      };
      const handleKeyPress = () => {
        resolve();
        document.removeEventListener("keypress", handleKeyPress);
      };
      document.addEventListener("click", handleClick);
      document.addEventListener("keypress", handleKeyPress);
    });
  }

  function handleFlip(row: number, col: number) {
    if (!game) return;
    if (memoMode) {
      updateGame((g) => g.flagCell(row, col, memoFlag));
      return;
    }
    const cell = game.cells[row][col];
    if (!cell.isFlipped) {
      const kind: "bomb" | "coin" | null =
        cell.value === "V" ? "bomb" : (cell.value as number) > 1 ? "coin" : null;
      if (kind && theme) {
        const id = nextId.current++;
        const onDone = () => setEffects((prev) => prev.filter((x) => x.id !== id));
        setEffects((prev) => [...prev, { id, kind, row, col, onDone }]);
      }
      if (!muted) {
        if (kind === "bomb") sfx.lose();
        else if (kind === "coin") sfx.coin(cell.value as number);
        else sfx.click();
      }
      onFirstInteraction();
    }
    updateGame((g) => g.flipCell(row, col));
  }

  const flipCardsUp = useCallback(() => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        setCardsFlipped((prev) => prev.map(() => ({ isFlipped: true })));
        resolve();
      }, 1000);
    });
  }, []);

  const flipCardsDown = useCallback(
    (delay = 1500) => {
      const columns = [
        [0, 5, 10, 15, 20],
        [1, 6, 11, 16, 21],
        [2, 7, 12, 17, 22],
        [3, 8, 13, 18, 23],
        [4, 9, 14, 19, 24],
      ];

      setTimeout(() => {
        let stagger = 0;
        for (let col = 0; col < 5; col++) {
          setTimeout(() => {
            setCardsFlipped((prev) =>
              prev.map((card, index) =>
                columns[col].includes(index) ? { isFlipped: false } : card,
              ),
            );
          }, stagger);
          stagger += 200;
        }
        setTimeout(() => {
          updateGame((g) => g.restartGame());
        }, stagger + 200);
      }, delay);
    },
    [updateGame],
  );

  useEffect(() => {
    setCardsFlipped(() =>
      game.cells.flat().map((cell) => ({ isFlipped: cell.isFlipped })),
    );
  }, [game.cells]);

  useEffect(() => {
    if (game.gameStatus === "win") {
      // Win: reveal the board, let the victory song play, then auto-advance.
      flipCardsUp().then(() => {
        const fallback = window.setTimeout(() => flipCardsDown(100), 8000);
        const advance = () => {
          window.clearTimeout(fallback);
          flipCardsDown(100);
        };
        if (muted) {
          window.setTimeout(advance, 1500);
        } else {
          playLevelWin(advance);
        }
      });
    } else if (game.gameStatus === "lose") {
      if (waitForClick) {
        flipCardsUp().then(() => {
          waitForUserInteraction().then(() => flipCardsDown(100));
        });
      } else {
        flipCardsUp().then(() => flipCardsDown());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.gameStatus]);

  return (
    <div className="relative w-full border-4 border-white bg-[#448563] p-1.5 outline outline-2 outline-gray-600 shadow-[0_4px_0_rgba(0,0,0,0.18),0_8px_24px_rgba(0,0,0,0.25)]">
      <div className="flex h-full w-full rounded-xl bg-[#58a66c] p-2">
        <div className="flex flex-col gap-[var(--svf-gap)]">
          <div className="flex gap-[var(--svf-gap)]">
            <div className="relative grid grid-cols-5 gap-[var(--svf-gap)]">
              {game.cells.flat().map((cell, i) => {
                const coordinate = indexToCoordinate(i);
                return (
                  <Card
                    key={i}
                    row={coordinate[0]}
                    col={coordinate[1]}
                    isFlipped={cardsFlipped[i]?.isFlipped}
                    flipCard={() => handleFlip(coordinate[0], coordinate[1])}
                    flags={cell.isFlipped ? undefined : cell.flags}
                  >
                    {cell.value === "V" ? (
                      <VoltorbIcon
                        size={28}
                        className="picture-outline voltorb"
                      />
                    ) : (
                      cell.value
                    )}
                  </Card>
                );
              })}

              {game.colValues.map((col, index) => (
                <RowColCard
                  coins={col.coins}
                  voltorbs={col.voltorbs}
                  key={index}
                  index={index}
                />
              ))}

              {theme && effects.map((e) => {
                const Comp = e.kind === "bomb" ? theme.BombFlip : theme.CoinReveal;
                return (
                  <div key={e.id} className="pointer-events-none absolute" style={{
                    left: `calc(${e.col} * (var(--svf-tile, 40px) + var(--svf-gap, 16px)))`,
                    top:  `calc(${e.row} * (var(--svf-tile, 40px) + var(--svf-gap, 16px)))`,
                    zIndex: 20,
                  }}>
                    <Comp row={e.row} col={e.col} onDone={e.onDone} />
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col gap-[var(--svf-gap)]">
              {game.rowValues.map((row, index) => (
                <RowColCard
                  coins={row.coins}
                  voltorbs={row.voltorbs}
                  key={index}
                  index={index}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// src/components/Scoreboard.tsx (1:1 port).
// ---------------------------------------------------------------------------

type ScoreboardProps = {
  totalScore: number;
  currentScore: number;
};

const Scoreboard = ({ currentScore, totalScore }: ScoreboardProps) => {
  return (
    <div className="flex w-full flex-col items-center gap-1 sm:gap-2">
      <div className="flex w-11/12 place-items-center rounded-5 border-2 sm:border-4 border-gray-300 bg-white px-2 outline outline-2 outline-gray-600">
        <div className="grow text-center text-sm leading-4 sm:text-3xl sm:leading-7 text-gray-600 drop-shadow-soft">
          Total <span className="block">Collected Coins</span>
        </div>
        <p
          className={`${scoreFont.className} flex translate-y-1 text-3xl sm:text-6xl text-gray-700 drop-shadow-soft`}
        >
          {totalScore.toString().padStart(5, "0")}
        </p>
      </div>
      <div className="flex w-11/12 place-items-center rounded-5 border-2 sm:border-4 border-gray-300 bg-white px-2 outline outline-2 outline-gray-600">
        <div className="grow text-center text-sm leading-4 sm:text-3xl sm:leading-7 text-gray-600 drop-shadow-soft">
          Coins Collected in <span className="block">Current Game</span>
        </div>
        <p
          className={`${scoreFont.className} flex translate-y-1 items-center text-3xl sm:text-6xl text-gray-700 drop-shadow-soft`}
        >
          {currentScore.toString().padStart(5, "0")}
        </p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// src/components/GameInfo.tsx (1:1 port).
// ---------------------------------------------------------------------------

type GameInfoProps = {
  currentLevel: number;
};

const GameInfo = ({ currentLevel }: GameInfoProps) => {
  return (
    <>
      <div className="border-2 sm:border-4 border-white bg-[#448563] px-4 sm:px-16 text-center text-base sm:text-3xl outline outline-2 outline-gray-600">
        <div className="leading-5 sm:leading-7 drop-shadow-default">
          <p>VOLTORB Flip Lv. {currentLevel}</p>
          <p>Flip the Cards and Collect Coins!</p>
        </div>
      </div>

      <div className="flex w-11/12 items-center gap-2 sm:gap-3 border-b-2 sm:border-b-4 border-b-gray-200 pt-2 sm:pt-3 text-base sm:text-3xl">
        <div className="flex gap-2 sm:gap-4">
          <Card fake={true}>1</Card>
          <Card fake={true}>2</Card>
          <Card fake={true}>3</Card>
        </div>
        <p className="drop-shadow-default">...x1! ...x2! ...x3!</p>
      </div>

      <div className="mr-4 flex w-8/12 items-center gap-2 sm:gap-3 self-end border-b-2 sm:border-b-4 border-b-gray-200 pt-2 sm:pt-3 text-base sm:text-3xl">
        <Card fake={true}>
          <VoltorbIcon size={28} className="picture-outline voltorb" />
        </Card>
        <p className="drop-shadow-default">Game Over! 0!</p>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// src/components/InstructionsModal.tsx (1:1 port).
// ---------------------------------------------------------------------------

type Language = "en" | "pt-BR";

type Translations = {
  howToPlayTitle: string;
  instructions: string[];
  tipsTitle: string;
  tips: string[];
};

const translations: Record<Language, Translations> = {
  en: {
    howToPlayTitle: "How to play",
    instructions: [
      "Click on the cards to reveal them.",
      "The colored cards show how many Coins and Voltorbs are there per row or column.",
      "The goal is to find all the x2 and x3 Coins on each Level while avoiding Voltorbs.",
      "Have fun!",
    ],
    tipsTitle: "Tips:",
    tips: [
      "Avoid the rows and columns you know that can only have either a x1 Coin or a Voltorb.",
      "Reveal the rows and columns with 0 Voltorbs first.",
    ],
  },
  "pt-BR": {
    howToPlayTitle: "Como jogar",
    instructions: [
      "Clique nos cards para revelá-los.",
      "Os cards coloridos mostram quantas Moedas e Voltorbs existem em cada linha e coluna.",
      "O objetivo é achar todas as Moedas x2 e x3 em cada Level, evitando achar os Voltorbs.",
      "Divirta-se!",
    ],
    tipsTitle: "Dicas:",
    tips: [
      "Evite linhas e colunas que podem ter apenas uma Moeda x1 ou um Voltorb.",
      "Revele todas as linhas e colunas com 0 Voltorbs primeiro.",
    ],
  },
};

type InstructionsModalProps = {
  language: Language;
  setModalOpen: Dispatch<SetStateAction<boolean>>;
};

const InstructionsModal = ({
  language,
  setModalOpen,
}: InstructionsModalProps) => {
  const { howToPlayTitle, instructions, tipsTitle, tips } =
    translations[language];

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setModalOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [setModalOpen]);

  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => setModalOpen(false), 180);
  }, [setModalOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  return (
    <div
      className={`svf-modal-backdrop absolute inset-0 z-[60] flex items-center justify-center overflow-y-auto p-3 ${
        closing ? "svf-modal-closing" : "svf-modal-open"
      }`}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={howToPlayTitle}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="svf-modal-card my-auto w-full max-w-[460px] cursor-default rounded-5 border-4 border-gray-300 bg-white outline outline-2 outline-gray-600 text-gray-700"
      >
        <div className="flex items-center justify-between border-b-2 border-gray-200 px-4 py-2">
          <div className="flex items-center gap-2">
            <PokeballIcon size={20} />
            <h1 className="text-2xl leading-none drop-shadow-soft">
              {howToPlayTitle}
            </h1>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded border-2 border-gray-300 bg-white text-lg leading-none text-gray-600 transition-colors hover:bg-zinc-100"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
              <rect x="1" y="2" width="2" height="2" />
              <rect x="3" y="4" width="2" height="2" />
              <rect x="5" y="6" width="4" height="2" />
              <rect x="9" y="4" width="2" height="2" />
              <rect x="11" y="2" width="2" height="2" />
              <rect x="1" y="10" width="2" height="2" />
              <rect x="3" y="8" width="2" height="2" />
              <rect x="9" y="8" width="2" height="2" />
              <rect x="11" y="10" width="2" height="2" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4 text-base leading-snug drop-shadow-soft">
          {/* Reward legend */}
          <section>
            <h2 className="mb-2 text-xl text-gray-700">Tiles &amp; rewards</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-lg">
              <div className="flex items-center gap-2">
                <Card fake>1</Card>
                <Card fake>2</Card>
                <Card fake>3</Card>
                <span>...x1! ...x2! ...x3!</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-lg">
              <div className="relative">
                <Card fake>
                  <VoltorbIcon size={24} className="picture-outline voltorb" />
                </Card>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <LoopingExplosion size={36} />
                </div>
              </div>
              <span>Game Over! 0!</span>
            </div>
          </section>

          {/* Demo animations */}
          <section>
            <h2 className="mb-2 text-xl text-gray-700">How it plays</h2>
            <ul className="flex list-disc flex-col gap-2 pl-6 text-base">
              <li>{instructions[0]}</li>
              <li>{instructions[1]}</li>
              <li>{instructions[2]}</li>
            </ul>
            <div className="mt-3 flex items-center justify-around gap-3 rounded-md bg-[#eef5ef] p-3">
              <div className="flex flex-col items-center gap-1">
                <div className="relative">
                  <Card fake>3</Card>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <LoopingSparkle size={38} />
                  </div>
                </div>
                <span className="text-xs text-gray-500">Collect coins</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="relative">
                  <Card fake>
                    <VoltorbIcon size={22} className="picture-outline voltorb" />
                  </Card>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <LoopingExplosion size={38} />
                  </div>
                </div>
                <span className="text-xs text-gray-500">Avoid Voltorbs</span>
              </div>
            </div>
          </section>

          {/* Tips */}
          <section>
            <h2 className="mb-1 text-xl text-gray-700">{tipsTitle}</h2>
            <ul className="flex list-disc flex-col gap-2 pl-6 text-base">
              <li>{tips[0]}</li>
              <li>{tips[1]}</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};

const EXPLODE_FRAME_URLS = Array.from(
  { length: 9 },
  (_, i) => `/games/super-voltorb-flip/sprites/upstream/tile/explode_${i}.png`,
);
const SUCCESS_FRAME_URLS = Array.from(
  { length: 4 },
  (_, i) => `/games/super-voltorb-flip/sprites/upstream/success_${i}.png`,
);

function LoopingFrames({
  frames,
  size,
  interval = 90,
  pauseMs = 0,
}: {
  frames: string[];
  size: number;
  interval?: number;
  pauseMs?: number;
}) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let timer: number;
    const tick = () => {
      if (cancelled) return;
      setFrame((f) => {
        const next = (f + 1) % frames.length;
        timer = window.setTimeout(tick, next === 0 && pauseMs > 0 ? pauseMs : interval);
        return next;
      });
    };
    timer = window.setTimeout(tick, interval);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [frames.length, interval, pauseMs]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={frames[frame]}
      width={size}
      height={size}
      alt=""
      style={{ imageRendering: "pixelated", pointerEvents: "none" }}
    />
  );
}

const LoopingExplosion = ({ size }: { size: number }) => (
  <LoopingFrames frames={EXPLODE_FRAME_URLS} size={size} interval={70} pauseMs={500} />
);

const LoopingSparkle = ({ size }: { size: number }) => (
  <LoopingFrames frames={SUCCESS_FRAME_URLS} size={size} interval={110} pauseMs={700} />
);

// ---------------------------------------------------------------------------
// src/components/InstructionsBtns.tsx (1:1 port).
// ---------------------------------------------------------------------------

const MobileHelpButton = ({ onOpen }: { onOpen: () => void }) => (
  <button
    onClick={onOpen}
    aria-label="How to play"
    title="How to play"
    className="flex h-10 w-10 items-center justify-center rounded-[6px] border-2 border-gray-300 bg-white outline outline-2 outline-gray-600 transition-colors hover:bg-zinc-100"
  >
    <PokeballIcon size={22} />
  </button>
);

const PixelMuteButton = ({
  muted,
  onToggle,
  size = 40,
}: {
  muted: boolean;
  onToggle: () => void;
  size?: number;
}) => (
  <button
    onClick={onToggle}
    aria-label={muted ? "Unmute" : "Mute"}
    title={muted ? "Unmute" : "Mute"}
    className="flex items-center justify-center rounded-[6px] border-2 border-gray-300 bg-white outline outline-2 outline-gray-600 text-gray-700 transition-colors hover:bg-zinc-100"
    style={{ width: size, height: size }}
  >
    <svg
      width={Math.round(size * 0.55)}
      height={Math.round(size * 0.55)}
      viewBox="0 0 16 16"
      style={{ imageRendering: "pixelated", shapeRendering: "crispEdges" }}
      aria-hidden
    >
      {/* speaker body */}
      <rect x="2" y="6" width="2" height="4" fill="currentColor" />
      <rect x="4" y="5" width="1" height="6" fill="currentColor" />
      {/* cone */}
      <rect x="5" y="4" width="1" height="8" fill="currentColor" />
      <rect x="6" y="3" width="1" height="10" fill="currentColor" />
      <rect x="7" y="2" width="1" height="12" fill="currentColor" />
      {muted ? (
        <>
          {/* diagonal slash */}
          <rect x="10" y="4" width="1" height="1" fill="#d62a18" />
          <rect x="11" y="5" width="1" height="1" fill="#d62a18" />
          <rect x="12" y="6" width="1" height="1" fill="#d62a18" />
          <rect x="13" y="7" width="1" height="1" fill="#d62a18" />
          <rect x="14" y="8" width="1" height="1" fill="#d62a18" />
          <rect x="13" y="9" width="1" height="1" fill="#d62a18" />
          <rect x="12" y="10" width="1" height="1" fill="#d62a18" />
          <rect x="11" y="11" width="1" height="1" fill="#d62a18" />
          <rect x="10" y="12" width="1" height="1" fill="#d62a18" />
        </>
      ) : (
        <>
          {/* sound waves */}
          <rect x="9" y="6" width="1" height="4" fill="currentColor" />
          <rect x="10" y="5" width="1" height="1" fill="currentColor" />
          <rect x="10" y="10" width="1" height="1" fill="currentColor" />
          <rect x="11" y="4" width="1" height="1" fill="currentColor" />
          <rect x="11" y="11" width="1" height="1" fill="currentColor" />
          <rect x="12" y="5" width="1" height="6" fill="currentColor" />
          <rect x="13" y="6" width="1" height="4" fill="currentColor" />
        </>
      )}
    </svg>
  </button>
);

const COIN_FRAMES = [1, 0.75, 0.35, -0.2, -0.75, -0.35, 0.35, 0.75];

const CoinSpinner = ({ size = 28 }: { size?: number }) => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setFrame((f) => (f + 1) % COIN_FRAMES.length),
      110,
    );
    return () => window.clearInterval(id);
  }, []);
  const scaleX = COIN_FRAMES[frame];
  const showEdge = Math.abs(scaleX) < 0.3;
  return (
    <div
      className="flex items-center justify-center"
      style={{ width: size, height: size, perspective: 200 }}
    >
      <div
        style={{
          transform: `scaleX(${scaleX})`,
          width: size,
          height: size,
          imageRendering: "pixelated",
          shapeRendering: "crispEdges",
        }}
      >
        {showEdge ? (
          <svg width={size} height={size} viewBox="0 0 16 16">
            <rect x="7" y="2" width="2" height="12" fill="#c69a32" />
            <rect x="7" y="2" width="1" height="12" fill="#f4c04c" />
          </svg>
        ) : (
          <svg width={size} height={size} viewBox="0 0 16 16">
            {/* outer black edge */}
            <rect x="5" y="1" width="6" height="1" fill="#5a4112" />
            <rect x="3" y="2" width="2" height="1" fill="#5a4112" />
            <rect x="11" y="2" width="2" height="1" fill="#5a4112" />
            <rect x="2" y="3" width="1" height="1" fill="#5a4112" />
            <rect x="13" y="3" width="1" height="1" fill="#5a4112" />
            <rect x="1" y="4" width="1" height="8" fill="#5a4112" />
            <rect x="14" y="4" width="1" height="8" fill="#5a4112" />
            <rect x="2" y="12" width="1" height="1" fill="#5a4112" />
            <rect x="13" y="12" width="1" height="1" fill="#5a4112" />
            <rect x="3" y="13" width="2" height="1" fill="#5a4112" />
            <rect x="11" y="13" width="2" height="1" fill="#5a4112" />
            <rect x="5" y="14" width="6" height="1" fill="#5a4112" />
            {/* body */}
            <rect x="5" y="2" width="6" height="1" fill="#f4c04c" />
            <rect x="3" y="3" width="10" height="1" fill="#f4c04c" />
            <rect x="3" y="4" width="10" height="1" fill="#f4c04c" />
            <rect x="2" y="5" width="12" height="7" fill="#f4c04c" />
            <rect x="3" y="12" width="10" height="1" fill="#f4c04c" />
            <rect x="5" y="13" width="6" height="1" fill="#f4c04c" />
            {/* highlight */}
            <rect x="4" y="3" width="2" height="1" fill="#fcea7d" />
            <rect x="3" y="4" width="2" height="1" fill="#fcea7d" />
            <rect x="2" y="5" width="1" height="3" fill="#fcea7d" />
            {/* shadow */}
            <rect x="11" y="11" width="2" height="1" fill="#c69a32" />
            <rect x="13" y="8" width="1" height="4" fill="#c69a32" />
            <rect x="12" y="12" width="1" height="1" fill="#c69a32" />
            {/* central dollar-ish glyph */}
            <rect x="7" y="5" width="2" height="1" fill="#8a6419" />
            <rect x="6" y="6" width="1" height="1" fill="#8a6419" />
            <rect x="7" y="7" width="2" height="1" fill="#8a6419" />
            <rect x="9" y="8" width="1" height="1" fill="#8a6419" />
            <rect x="7" y="9" width="2" height="1" fill="#8a6419" />
            <rect x="7" y="4" width="2" height="1" fill="#8a6419" />
            <rect x="7" y="10" width="2" height="1" fill="#8a6419" />
          </svg>
        )}
      </div>
    </div>
  );
};

const PokeballIcon = ({ size = 22 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    style={{ imageRendering: "pixelated", shapeRendering: "crispEdges" }}
    aria-hidden
  >
    {/* outer black ring */}
    <rect x="5" y="0" width="6" height="1" fill="#1a1a1a" />
    <rect x="3" y="1" width="2" height="1" fill="#1a1a1a" />
    <rect x="11" y="1" width="2" height="1" fill="#1a1a1a" />
    <rect x="2" y="2" width="1" height="1" fill="#1a1a1a" />
    <rect x="13" y="2" width="1" height="1" fill="#1a1a1a" />
    <rect x="1" y="3" width="1" height="3" fill="#1a1a1a" />
    <rect x="14" y="3" width="1" height="3" fill="#1a1a1a" />
    <rect x="0" y="6" width="1" height="4" fill="#1a1a1a" />
    <rect x="15" y="6" width="1" height="4" fill="#1a1a1a" />
    <rect x="1" y="10" width="1" height="3" fill="#1a1a1a" />
    <rect x="14" y="10" width="1" height="3" fill="#1a1a1a" />
    <rect x="2" y="13" width="1" height="1" fill="#1a1a1a" />
    <rect x="13" y="13" width="1" height="1" fill="#1a1a1a" />
    <rect x="3" y="14" width="2" height="1" fill="#1a1a1a" />
    <rect x="11" y="14" width="2" height="1" fill="#1a1a1a" />
    <rect x="5" y="15" width="6" height="1" fill="#1a1a1a" />
    {/* red top half */}
    <rect x="5" y="1" width="6" height="1" fill="#e74c3c" />
    <rect x="3" y="2" width="10" height="1" fill="#e74c3c" />
    <rect x="2" y="3" width="12" height="1" fill="#e74c3c" />
    <rect x="2" y="4" width="12" height="1" fill="#e74c3c" />
    <rect x="1" y="5" width="14" height="1" fill="#e74c3c" />
    <rect x="1" y="6" width="14" height="1" fill="#d62a18" />
    {/* highlight on top-left */}
    <rect x="4" y="2" width="2" height="1" fill="#ff8673" />
    <rect x="3" y="3" width="2" height="1" fill="#ff8673" />
    {/* black band */}
    <rect x="1" y="7" width="5" height="2" fill="#1a1a1a" />
    <rect x="10" y="7" width="5" height="2" fill="#1a1a1a" />
    {/* center circle ring */}
    <rect x="6" y="6" width="4" height="1" fill="#1a1a1a" />
    <rect x="6" y="9" width="4" height="1" fill="#1a1a1a" />
    <rect x="5" y="7" width="1" height="2" fill="#1a1a1a" />
    <rect x="10" y="7" width="1" height="2" fill="#1a1a1a" />
    {/* center white */}
    <rect x="6" y="7" width="4" height="2" fill="#ffffff" />
    {/* white bottom half */}
    <rect x="1" y="9" width="14" height="1" fill="#f5f5f5" />
    <rect x="1" y="10" width="14" height="1" fill="#ffffff" />
    <rect x="2" y="11" width="12" height="1" fill="#ffffff" />
    <rect x="2" y="12" width="12" height="1" fill="#ffffff" />
    <rect x="3" y="13" width="10" height="1" fill="#ffffff" />
    <rect x="5" y="14" width="6" height="1" fill="#ffffff" />
    {/* subtle bottom shadow */}
    <rect x="3" y="13" width="3" height="1" fill="#d0d0d0" />
    <rect x="2" y="12" width="2" height="1" fill="#d0d0d0" />
  </svg>
);

const InstructionsBtns = ({ onOpen }: { onOpen: () => void }) => (
  <button
    onClick={onOpen}
    aria-label="How to play"
    title="How to play"
    className="flex items-center gap-2 rounded-5 border-4 border-gray-300 bg-white px-3 py-1 outline outline-2 outline-gray-600 hover:bg-zinc-200"
  >
    <PokeballIcon size={22} />
    <span className="text-2xl leading-7 text-gray-600 drop-shadow-soft">
      How to play
    </span>
  </button>
);

// ---------------------------------------------------------------------------
// src/components/Settings.tsx (1:1 port).
// ---------------------------------------------------------------------------

// Settings panel (upstream's "wait for click" toggle) removed — upstream's
// default behavior is always-on in this portfolio build.

// ---------------------------------------------------------------------------
// src/components/Footer.tsx (1:1 port).
// ---------------------------------------------------------------------------

const Footer = () => null;

// ---------------------------------------------------------------------------
// Exported root component — mirrors upstream src/pages/index.tsx layout, but
// renders only the game panel (no full-screen background), matching the
// portfolio's per-game-page behavior.
// ---------------------------------------------------------------------------

export function SuperVoltorbFlipGame() {
  const { game, updateGame } = useGame();
  const [muted, toggleMute] = useMute();
  const [memoMode, setMemoMode] = useState(false);
  const [memoFlag, setMemoFlag] = useState<1 | 2 | 3 | "V">(1);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const musicStartedRef = useRef(false);

  useEffect(() => {
    setMusicMuted(muted);
  }, [muted]);

  useEffect(() => {
    return () => {
      stopMusic();
      stopGameOver();
      stopLevelWin();
      musicStartedRef.current = false;
    };
  }, []);

  // Pause music when the tab becomes hidden; don't auto-resume on return.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      if (document.hidden) {
        // Fully stop music (not just pause) when tab loses focus. This prevents
        // music from continuing to play in the background on some browsers, and
        // ensures the next game session starts fresh without auto-resuming.
        stopMusic();
        musicStartedRef.current = false;
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Persist level + total score to localStorage on change.
  useEffect(() => {
    if (!game) return;
    if (typeof window === "undefined") return;
    localStorage.setItem(
      "svf:progress",
      JSON.stringify({
        currentLevel: game.currentLevel,
        totalScore: game.totalScore,
      }),
    );
  }, [game?.currentLevel, game?.totalScore]);

  // Reset memo mode + drive music/game-over audio on status transitions.
  // restartGame sets status back to "playing" after cards flip down.
  const prevGameStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!game) return;
    const prev = prevGameStatusRef.current;
    const cur = game.gameStatus;
    if (cur === "lose" && prev !== "lose") {
      // Fade the loop fast, then the game_over jingle plays over the reveal.
      fadeOutMusic(350);
      window.setTimeout(() => {
        if (!muted) playGameOver();
      }, 320);
    }
    if (cur === "win" && prev !== "win") {
      // Fade the loop so the level-win song plays cleanly; Gameboard handles
      // actually starting music_level_win and auto-advancing on its end event.
      fadeOutMusic(250);
    }
    if ((prev === "win" || prev === "lose") && cur === "playing") {
      setMemoMode(false);
      stopGameOver();
      stopLevelWin();
      if (!muted) {
        musicStartedRef.current = true;
        playMusic();
      }
    }
    prevGameStatusRef.current = cur;
  }, [game?.gameStatus, muted]);

  function handleFirstInteraction() {
    if (!musicStartedRef.current && !muted) {
      musicStartedRef.current = true;
      playMusic();
    }
  }

  return (
    <EffectsProvider>
      <div
        className={`svf-root relative ${pokemonFont.variable} ${numberFont.variable} ${scoreFont.variable} ${pokemonFont.className} flex flex-col items-center md:grid md:grid-cols-[auto_1fr] md:items-start md:gap-4 text-white p-1 sm:p-2`}
      >
        <style>{SCOPED_STYLES}</style>

        {howToPlayOpen && (
          <InstructionsModal
            language="en"
            setModalOpen={setHowToPlayOpen}
          />
        )}

        {/* Compact mobile bar (hidden at sm+). Shows level, both scores,
            mute, help and memo in one tight strip so the board gets room. */}
        {game && (
          <div className="flex w-full max-w-[420px] flex-col gap-1.5 sm:hidden">
            <div className="flex items-stretch gap-2 rounded-[6px] border-2 border-gray-300 bg-white px-1.5 py-1 outline outline-2 outline-gray-600 text-gray-700">
              <CoinSpinner size={28} />
              <div className="flex min-w-[44px] flex-col items-center justify-center rounded-[3px] bg-[#448563] px-1 leading-none text-white">
                <span className="text-[9px] font-bold uppercase tracking-widest">
                  Lv
                </span>
                <span className="text-lg font-black">
                  {game.currentLevel}
                </span>
              </div>
              <div className="flex flex-1 items-center justify-around gap-2">
                <div className="flex flex-col items-center leading-none">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">
                    Total
                  </span>
                  <span className={`${scoreFont.className} text-xl`}>
                    {game.totalScore.toString().padStart(5, "0")}
                  </span>
                </div>
                <div className="h-8 w-[2px] bg-gray-200" />
                <div className="flex flex-col items-center leading-none">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">
                    This game
                  </span>
                  <span className={`${scoreFont.className} text-xl`}>
                    {game.currentScore.toString().padStart(5, "0")}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <MobileHelpButton onOpen={() => setHowToPlayOpen(true)} />
                <PixelMuteButton muted={muted} onToggle={toggleMute} size={40} />
              </div>
              <MemoPanel
                compact
                mode={memoMode}
                flag={memoFlag}
                onToggleMode={() => setMemoMode((m) => !m)}
                onFlagChange={setMemoFlag}
              />
            </div>
          </div>
        )}

        {/* Desktop / tablet left column (sm+ only). */}
        <div className="hidden sm:flex flex-col items-center gap-2 md:items-stretch md:min-w-[220px]">
          <div className="flex w-full items-center justify-center gap-2 md:justify-start">
            <InstructionsBtns onOpen={() => setHowToPlayOpen(true)} />
            <PixelMuteButton muted={muted} onToggle={toggleMute} size={44} />
            <MemoPanel
              compact
              mode={memoMode}
              flag={memoFlag}
              onToggleMode={() => setMemoMode((m) => !m)}
              onFlagChange={setMemoFlag}
            />
          </div>
          {game && (
            <Scoreboard
              currentScore={game.currentScore}
              totalScore={game.totalScore}
            />
          )}
        </div>

        {/* Right column: tiny level banner (sm+), gameboard, footer */}
        <div className="flex flex-col items-center gap-2">
          {game && (
            <>
              <div className="hidden w-full sm:flex sm:items-center sm:justify-center">
                <div className="flex items-center gap-2 rounded-[6px] border-2 border-white bg-[#448563] px-3 py-1 outline outline-2 outline-gray-600 text-base drop-shadow-default">
                  <span className="font-bold uppercase tracking-widest text-white/80 text-xs">
                    Lv
                  </span>
                  <span className="text-lg font-black">{game.currentLevel}</span>
                  <span className="ml-2 text-sm text-white/70">
                    VOLTORB Flip
                  </span>
                </div>
              </div>
              <Gameboard
                game={game}
                updateGame={updateGame}
                waitForClick
                muted={muted}
                onFirstInteraction={handleFirstInteraction}
                memoMode={memoMode}
                memoFlag={memoFlag}
              />
              <Footer />
            </>
          )}
        </div>
      </div>
    </EffectsProvider>
  );
}
