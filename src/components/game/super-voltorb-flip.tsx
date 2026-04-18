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
import { sfx, playMusic, stopMusic, setMusicMuted } from "./super-voltorb-flip/audio";
import { useMute } from "./super-voltorb-flip/use-mute";

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
  right: -17px;
  top: 50%;
  width: 18px;
  height: 8px;
  transform: translateY(-50%);
  z-index: 0;
  pointer-events: none;
  box-shadow: 0 1px 0 #e5e7eb, 0 -1px 0 #e5e7eb;
}
.svf-root .svf-conn-s {
  position: absolute;
  bottom: -17px;
  left: 50%;
  height: 18px;
  width: 8px;
  transform: translateX(-50%);
  z-index: 0;
  pointer-events: none;
  box-shadow: 1px 0 0 #e5e7eb, -1px 0 0 #e5e7eb;
}
/* Cursor/hover selection — matches the red frame on the active tile in HG/SS.
   Two overlapping shadows give the pixel-art look: dark inner hairline +
   solid red outside. */
.svf-root .cursor-pointer::before {
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
.svf-root .cursor-pointer:hover::before,
.svf-root .cursor-pointer:focus-visible::before {
  opacity: 1;
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
};

const Card = ({ children, fake, isFlipped, flipCard, row, col }: CardProps) => {
  const rowColor = row !== undefined ? COLORS[row] : undefined;
  const colColor = col !== undefined ? COLORS[col] : undefined;
  return fake ? (
    <div className="relative box-content flex h-10 w-10 select-none rounded-sm border-2 border-gray-700 outline outline-4 outline-gray-200">
      <div
        className={`${numberFont.className} text-shadow-white flex h-full w-full place-content-center place-items-center border-2 border-[#a55a52] bg-[#bd8c84] text-3xl font-bold text-black`}
      >
        {children}
      </div>
    </div>
  ) : (
    <div className="relative h-10 w-10 cursor-pointer place-self-center [perspective:1000px]" onClick={flipCard}>
      {rowColor && <div className="svf-conn-e" style={{ backgroundColor: rowColor }} />}
      {colColor && <div className="svf-conn-s" style={{ backgroundColor: colColor }} />}
      <div
        className="relative box-content flex h-10 w-10 select-none rounded-sm border-2 border-gray-700 outline outline-4 outline-gray-200 transition-all duration-500 [transform-style:preserve-3d] [backface-visibility:hidden]"
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
      className={`${numberFont.className} relative z-[5] box-content flex h-11 w-11 select-none flex-col rounded-sm outline outline-4 outline-gray-200`}
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
};

type ActiveEffect = { id: number; kind: "bomb" | "coin"; row: number; col: number; onDone: () => void };

const Gameboard = ({ game, updateGame, waitForClick, muted, onFirstInteraction }: GameboardProps) => {
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
    const cell = game.cells[row][col];
    if (!cell.isFlipped) {
      const kind: "bomb" | "coin" | null =
        cell.value === "V" ? "bomb" : (cell.value as number) > 1 ? "coin" : null;
      if (kind) {
        const id = nextId.current++;
        const onDone = () => setEffects((prev) => prev.filter((x) => x.id !== id));
        setEffects((prev) => [...prev, { id, kind, row, col, onDone }]);
      }
      if (!muted) {
        if (kind === "bomb") sfx.lose();
        else if (kind === "coin") sfx.coin();
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
    if (game.gameStatus === "lose" || game.gameStatus === "win") {
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
    <div className="relative h-96 w-full border-4 border-white bg-[#448563] p-1.5 outline outline-2 outline-gray-600 shadow-[0_4px_0_rgba(0,0,0,0.18),0_8px_24px_rgba(0,0,0,0.25)]">
      {(game.gameStatus === "lose" || game.gameStatus === "win") && (
        <div className="absolute inset-0 z-50 h-full w-full bg-blue-500 opacity-0"></div>
      )}
      <div className="flex h-full w-full rounded-xl bg-[#58a66c] p-2">
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="relative grid grid-cols-5 gap-4">
              {game.cells.flat().map((cell, i) => {
                const coordinate = indexToCoordinate(i);
                return (
                  <Card
                    key={i}
                    row={coordinate[0]}
                    col={coordinate[1]}
                    isFlipped={cardsFlipped[i]?.isFlipped}
                    flipCard={() => handleFlip(coordinate[0], coordinate[1])}
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
            <div className="flex flex-col gap-3">
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
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex w-11/12 place-items-center rounded-5 border-4 border-gray-300 bg-white px-2 outline outline-2 outline-gray-600">
        <div className="grow text-center text-3xl leading-7 text-gray-600 drop-shadow-soft">
          Total <span className="block">Collected Coins</span>
        </div>
        <p
          className={`${scoreFont.className} flex translate-y-1 text-6xl text-gray-700 drop-shadow-soft`}
        >
          {totalScore.toString().padStart(5, "0")}
        </p>
      </div>
      <div className="flex w-11/12 place-items-center rounded-5 border-4 border-gray-300 bg-white px-2 outline outline-2 outline-gray-600">
        <div className="grow text-center text-3xl leading-7 text-gray-600 drop-shadow-soft">
          Coins Collected in <span className="block">Current Game</span>
        </div>
        <p
          className={`${scoreFont.className} flex translate-y-1 items-center text-6xl text-gray-700 drop-shadow-soft`}
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
      <div className="border-4 border-white bg-[#448563] px-16 text-center text-3xl outline outline-2 outline-gray-600">
        <div className="leading-7 drop-shadow-default">
          <p>VOLTORB Flip Lv. {currentLevel}</p>
          <p>Flip the Cards and Collect Coins!</p>
        </div>
      </div>

      <div className="flex w-11/12 gap-3 border-b-4 border-b-gray-200 pt-3 text-3xl">
        <div className="flex gap-4">
          <Card fake={true}>1</Card>
          <Card fake={true}>2</Card>
          <Card fake={true}>3</Card>
        </div>
        <p className="drop-shadow-default">...x1! ...x2! ...x3!</p>
      </div>

      <div className="mr-4 flex w-8/12 gap-3 self-end border-b-4 border-b-gray-200 pt-3 text-3xl ">
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
    howToPlayTitle: "How to play:",
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
    howToPlayTitle: "Como jogar:",
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

  return (
    <>
      <div
        className="fixed z-50 h-full w-screen -translate-y-2 bg-black opacity-50 "
        onClick={() => setModalOpen(false)}
      />
      <div
        onClick={() => setModalOpen(false)}
        className="fixed z-50 cursor-default rounded-5 border-4 border-gray-300 bg-white outline outline-2 outline-gray-600"
      >
        <div className="flex flex-col gap-8 p-6 pt-3 text-gray-800 drop-shadow-soft">
          <div>
            <h1 className="text-4xl text-gray-700">{howToPlayTitle}</h1>
            <ul className="flex list-disc flex-col gap-4 pl-8 pr-2 pt-2 text-2xl leading-6">
              <li>{instructions[0]}</li>
              <li>{instructions[1]}</li>
              <li>{instructions[2]}</li>
              <li>{instructions[3]}</li>
            </ul>
          </div>
          <div>
            <h1 className="text-4xl text-gray-700">{tipsTitle}</h1>
            <ul className="flex list-disc flex-col gap-4 pl-8 pr-2 text-2xl leading-6">
              <li>{tips[0]}</li>
              <li>{tips[1]}</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// src/components/InstructionsBtns.tsx (1:1 port).
// ---------------------------------------------------------------------------

const InstructionsBtns = () => {
  const [language, setLanguage] = useState<Language>("en");
  const [modalOpen, setModalOpen] = useState(false);

  function handleClick(language: Language) {
    setLanguage(language);
    setModalOpen(true);
  }

  return (
    <>
      {modalOpen && (
        <InstructionsModal language={language} setModalOpen={setModalOpen} />
      )}
      <div className="flex w-full justify-around gap-2">
        <div
          className="flex w-11/12 cursor-pointer place-items-center rounded-5 border-4 border-gray-300 bg-white px-2 outline outline-2 outline-gray-600 hover:bg-zinc-200"
          onClick={() => {
            handleClick("pt-BR");
          }}
        >
          <div className="grow text-center text-3xl leading-7 text-gray-600 drop-shadow-soft">
            Como jogar
          </div>
        </div>
        <div
          className="flex w-11/12 cursor-pointer place-items-center rounded-5 border-4 border-gray-300 bg-white px-2 outline outline-2 outline-gray-600 hover:bg-zinc-200"
          onClick={() => {
            handleClick("en");
          }}
        >
          <div className="grow text-center text-3xl leading-7 text-gray-600 drop-shadow-soft">
            How to play
          </div>
        </div>
      </div>
    </>
  );
};

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
  const musicStartedRef = useRef(false);

  useEffect(() => {
    setMusicMuted(muted);
  }, [muted]);

  useEffect(() => {
    return () => {
      stopMusic();
      musicStartedRef.current = false;
    };
  }, []);

  function handleFirstInteraction() {
    if (!musicStartedRef.current && !muted) {
      musicStartedRef.current = true;
      playMusic();
    }
  }

  return (
    <EffectsProvider>
      <div
        className={`svf-root ${pokemonFont.variable} ${numberFont.variable} ${scoreFont.variable} ${pokemonFont.className} flex flex-col items-center text-white`}
      >
        <style>{SCOPED_STYLES}</style>
        <div className="flex flex-col items-center gap-2 p-2">
          <div className="flex w-full items-center justify-between">
            <InstructionsBtns />
            <button
              onClick={toggleMute}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-white/70 hover:text-white transition-colors"
              aria-label={muted ? "Unmute" : "Mute"}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              )}
            </button>
          </div>
          {game && (
            <>
              <GameInfo currentLevel={game.currentLevel} />
              <Scoreboard
                currentScore={game.currentScore}
                totalScore={game.totalScore}
              />
              <Gameboard
                game={game}
                updateGame={updateGame}
                waitForClick
                muted={muted}
                onFirstInteraction={handleFirstInteraction}
              />
              <Footer />
            </>
          )}
        </div>
      </div>
    </EffectsProvider>
  );
}
