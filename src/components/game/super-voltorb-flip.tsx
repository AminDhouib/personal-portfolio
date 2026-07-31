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
import { MemoBar, type MemoFlag, type MemoFlagSet } from "./super-voltorb-flip/memo-button";
import { COLORS, type Cell, type FlagValues } from "./super-voltorb-flip/types";
import { VoltorbFlip, cloneGame, indexToCoordinate } from "./super-voltorb-flip/engine";
import {
  VoltorbIcon,
  LoopingExplosion,
  LoopingSparkle,
  PokeballIcon,
  CoinSpinner,
  InstructionsBtns,
  PixelMuteButton,
  PixelFullscreenButton,
  useFullscreen,
} from "./super-voltorb-flip/chrome";

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
// src/hooks/useGame.tsx (1:1, with cloneGame replacing lodash's cloneDeep).
// ---------------------------------------------------------------------------

function initialGameSize() {
  // `?size=N` (N in 2..10) creates a non-default board for layout testing.
  // Game logic is scaled proportionally but authored for 5x5 — use at your
  // own risk for "real" play.
  if (typeof window === "undefined") return 5;
  const q = new URLSearchParams(window.location.search).get("size");
  const n = q ? parseInt(q, 10) : NaN;
  return Number.isFinite(n) && n >= 2 && n <= 10 ? n : 5;
}

const useGame = () => {
  const [size, setSize] = useState(initialGameSize);
  const [game, setGame] = useState<VoltorbFlip>(() => new VoltorbFlip(size));

  function updateGame(callback: (game: VoltorbFlip) => void): void {
    if (!game) return;
    const newGame = cloneGame(game);
    callback(newGame);
    setGame(newGame);
  }

  function setGameSize(n: number) {
    const clamped = Math.max(2, Math.min(10, Math.round(n)));
    setSize(clamped);
    setGame(new VoltorbFlip(clamped));
  }

  return { game, updateGame, size, setGameSize };
};

// ---------------------------------------------------------------------------
// Inlined utility styles (from upstream src/styles/globals.css and
// tailwind.config.js). Rendered once on mount and scoped by class name so
// we don't pollute the global stylesheet across the portfolio.
// ---------------------------------------------------------------------------

const SCOPED_STYLES = `
.svf-root {
  --svf-n: 5;
  --svf-tile: 40px;
  --svf-gap: 16px;
}
/* Fluid board sizing. .svf-board-frame is a container-query root so the
   tiles/gaps can solve for any --svf-n (board size) from 2 to 7. Formula:
     tile*(N+1) + gap*N = contentWidth, gap = 0.28*tile
     -> tile = contentWidth / (1.28*N + 1)
   The 12px constant accounts for outer tile outlines that sit outside each
   grid cell (outline-4 = 4px, times ~1.5 cells on average). */
.svf-root .svf-board-frame {
  container-type: inline-size;
  container-name: svf-board;
  --svf-pad: 12px;
  --svf-tile-cap: 72px;
  --svf-tile-ideal: calc((100cqw - 2 * var(--svf-pad) - 16px) / (1.28 * var(--svf-n) + 1));
  --svf-tile: min(var(--svf-tile-cap), var(--svf-tile-ideal));
  --svf-gap: calc(var(--svf-tile) * 0.28);
  /* Cap so a small board doesn't stretch the frame into empty green space
     at the tile cap: cap width = tileCap * (1.28N + 1) + frame chrome. */
  --svf-max-cap: calc(var(--svf-tile-cap) * (1.28 * var(--svf-n) + 1) + 2 * var(--svf-pad) + 16px);
  /* Explicit width so a mobile parent (flex-col items-center) can't
     collapse us to 0 — the container-query math needs a real inline size. */
  width: min(92vw, 380px, var(--svf-max-cap));
  margin-inline: auto;
}
@media (min-width: 640px) {
  .svf-root .svf-board-frame { width: min(92vw, 460px, var(--svf-max-cap)); }
}
@media (min-width: 1024px) {
  .svf-root .svf-board-frame { width: min(60vw, 560px, var(--svf-max-cap)); }
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
/* Peek mode: force every tile to its face-up state with no flip animation.
   Used by the debug panel to preview the whole board without disturbing
   game state (cells.isFlipped stays unchanged). */
.svf-root .svf-peek .svf-tile-wrap > div {
  transition-duration: 0ms !important;
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
/* Level transition flashes — keyed by .svf-lv-flash-up / -down. */
.svf-lv-flash-up   { animation: svf-lv-flash-up   1.1s ease-out 1 both; }
.svf-lv-flash-down { animation: svf-lv-flash-down 1.1s ease-out 1 both; }
@keyframes svf-lv-flash-up {
  0%   { background-color: #448563; box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); transform: scale(1); }
  20%  { background-color: #4ade80; box-shadow: 0 0 0 6px rgba(74, 222, 128, 0.55); transform: scale(1.18); }
  60%  { background-color: #6ee08e; box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.20); transform: scale(1.06); }
  100% { background-color: #448563; box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); transform: scale(1); }
}
@keyframes svf-lv-flash-down {
  0%   { background-color: #448563; box-shadow: 0 0 0 0 rgba(248, 113, 113, 0); transform: scale(1); }
  20%  { background-color: #b45353; box-shadow: 0 0 0 6px rgba(248, 113, 113, 0.55); transform: scale(0.94) rotate(-1.5deg); }
  60%  { background-color: #6e4848; box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.20); transform: scale(0.98) rotate(0.5deg); }
  100% { background-color: #448563; box-shadow: 0 0 0 0 rgba(248, 113, 113, 0); transform: scale(1); }
}

/* Risk-warning tile shake — keyed by .svf-tile-anxious on the wrap.
   Animation lives on the wrap's non-connector children so the row/col
   connector lines (.svf-conn-e / .svf-conn-s) stay still while the
   actual tile shakes. Plays while ME_CARDGAME1 fanfare is playing and
   other taps are locked out. */
.svf-tile-anxious > *:not(.svf-conn-e):not(.svf-conn-s) {
  animation: svf-tile-shake 0.32s linear infinite;
  filter: drop-shadow(0 0 6px rgba(248, 113, 113, 0.55));
}
@keyframes svf-tile-shake {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  20%  { transform: translate(-2px, 1px) rotate(-1.4deg); }
  40%  { transform: translate(2px, -1px) rotate(1.4deg); }
  60%  { transform: translate(-1px, 2px) rotate(-0.8deg); }
  80%  { transform: translate(1px, -2px) rotate(0.8deg); }
}

/* When the game element is fullscreened, fill the viewport with the
   board background so the surrounding chrome doesn't bleed through. */
.svf-root:fullscreen,
.svf-root:-webkit-full-screen {
  width: 100vw;
  height: 100vh;
  background: #2d4f3c;
  padding: 24px;
  overflow: auto;
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
  flipCard?: () => void;
  row?: number;
  col?: number;
  flags?: FlagValues;
  warning?: boolean;
};

const Card = ({ children, fake, isFlipped, flipCard, row, col, flags, warning }: CardProps) => {
  const rowColor = row !== undefined ? COLORS[row] : undefined;
  const colColor = col !== undefined ? COLORS[col] : undefined;
  const faceTextStyle: React.CSSProperties = { fontSize: "calc(var(--svf-tile) * 0.6)" };
  const flagSize = "calc(var(--svf-tile) * 0.34)";
  return fake ? (
    <div className="relative box-content flex h-[var(--svf-tile)] w-[var(--svf-tile)] rounded-sm border-2 border-gray-700 outline outline-4 outline-gray-200 select-none">
      <div
        className={`${numberFont.className} flex h-full w-full place-content-center place-items-center border-2 border-[#a55a52] bg-[#bd8c84] font-bold text-black text-shadow-white`}
        style={faceTextStyle}
      >
        {children}
      </div>
    </div>
  ) : (
    <div
      className={`svf-tile-wrap relative h-[var(--svf-tile)] w-[var(--svf-tile)] cursor-pointer place-self-center [perspective:1000px]${warning ? "svf-tile-anxious" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={
        row !== undefined && col !== undefined
          ? `Row ${row + 1}, Col ${col + 1}, ${isFlipped ? "revealed" : "face down"}`
          : undefined
      }
      onClick={flipCard}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") flipCard?.();
      }}
    >
      {rowColor && <div className="svf-conn-e" style={{ backgroundColor: rowColor }} />}
      {colColor && <div className="svf-conn-s" style={{ backgroundColor: colColor }} />}
      <div
        className="relative box-content flex h-[var(--svf-tile)] w-[var(--svf-tile)] rounded-sm border-2 border-gray-700 outline outline-4 outline-gray-200 transition-all duration-500 select-none [backface-visibility:hidden] [transform-style:preserve-3d]"
        style={{ transform: `${isFlipped ? "rotateY(180deg)" : "none"}` }}
      >
        <div
          className={`${numberFont.className} flex h-full w-full [transform:rotateY(180deg)] place-content-center place-items-center rounded-sm border-2 border-black bg-[#bd8c84] font-bold text-black outline outline-4 outline-gray-200 [backface-visibility:hidden] text-shadow-white`}
          style={faceTextStyle}
        >
          <div className="flex h-full w-full items-center justify-center border-2 border-[#8a4236]">
            {/* Only mount the value once the tile is actually revealed. "Face
                down" is nothing but a CSS rotateY on the wrapper, so rendering
                {children} unconditionally put every unflipped tile's value
                (and the Voltorb sprite's src) in the DOM -- readable straight
                off textContent, which is the whole board's solution. The peek
                easter egg still works: it drives this same isFlipped prop. */}
            {isFlipped ? children : null}
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
                    i === 0
                      ? "items-start justify-start"
                      : i === 1
                        ? "items-start justify-end"
                        : i === 2
                          ? "items-end justify-start"
                          : "items-end justify-end",
                  ].join(" ")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    // Asset mapping: memo/0.png = voltorb glyph, 1.png = "1",
                    // 2.png = "2", 3.png = "3". Was off-by-one before — flag
                    // 1 was loading 0.png (voltorb), flag 3 was loading 2.png.
                    src={`/games/super-voltorb-flip/sprites/upstream/memo/${f === "V" ? 0 : f}.png`}
                    alt=""
                    style={{
                      imageRendering: "pixelated",
                      width: flagSize,
                      height: flagSize,
                    }}
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
      className={`${numberFont.className} relative z-[5] box-content flex h-[var(--svf-tile)] w-[var(--svf-tile)] flex-col rounded-sm outline outline-4 outline-gray-200 select-none`}
    >
      <div
        className="relative flex h-full w-full flex-col place-content-center place-items-center font-bold text-gray-800"
        style={{
          backgroundColor: COLORS[index],
          fontSize: "calc(var(--svf-tile) * 0.55)",
        }}
      >
        <div
          className="absolute right-0 text-end tracking-widest"
          style={{ top: "calc(var(--svf-tile) * -0.22)" }}
        >
          {coins.toString().padStart(2, "0")}
        </div>
        <div
          className="absolute w-full outline outline-2 outline-gray-200"
          style={{ top: "50%" }}
        />
        <div
          className="absolute flex items-center gap-0.5"
          style={{ bottom: "calc(var(--svf-tile) * -0.15)" }}
        >
          <VoltorbIcon cssSize="calc(var(--svf-tile) * 0.72)" className="voltorb object-contain" />
          <p style={{ transform: "translate(-1px, 2px)" }}>{voltorbs}</p>
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
  memoFlags: MemoFlagSet;
  peek?: boolean;
  /**
   * Called after the level-win fanfare finishes (or after an equivalent
   * silent delay when muted), BEFORE flipCardsDown runs. Returns a
   * Promise that resolves once the parent's payout sequence has finished
   * — counter scrolling + drain SE chain. Gameboard awaits the promise
   * so the cards stay revealed while the parent animates the score
   * cards.
   */
  runPostFanfare?: () => Promise<void>;
  /**
   * Fired right before flipCardsDown begins so the parent can flash the
   * Lv card with the level-up / level-down SE in time with the cards
   * folding away (rather than after the new round has already loaded).
   */
  onFlipDownStart?: (dir: "up" | "down") => void;
};

type ActiveEffect = {
  id: number;
  kind: "bomb" | "coin";
  row: number;
  col: number;
  onDone: () => void;
};

const Gameboard = ({
  game,
  updateGame,
  waitForClick,
  muted,
  onFirstInteraction,
  memoFlags,
  peek = false,
  runPostFanfare,
  onFlipDownStart,
}: GameboardProps) => {
  const [cardsFlipped, setCardsFlipped] = useState<{ isFlipped: boolean }[]>(
    game.cells.flat().map((cell) => ({ isFlipped: cell.isFlipped })),
  );
  const [effects, setEffects] = useState<ActiveEffect[]>([]);
  const theme = useEffectsTheme();
  const nextId = useRef(0);
  // Tile being announced by the risk fanfare. Renders the anxious shake
  // and gates handleFlip so no other tap can land while it's playing.
  const [warningTile, setWarningTile] = useState<{ row: number; col: number } | null>(null);
  const warningTileRef = useRef<{ row: number; col: number } | null>(null);

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
    // Once the round is settled (voltorb hit or all valuable coins found),
    // the board freezes until restartGame() runs from the win/lose flow.
    if (game.gameStatus === "lose" || game.gameStatus === "win") return;
    // While ME_CARDGAME1 is announcing a high-risk tile, the board is
    // locked — only the targeted tile is "live" and it commits when the
    // delay below resolves. Mirrors voltorb_flip.c, which freezes input
    // for the duration of the fanfare.
    if (warningTileRef.current) return;
    const rowCells = game.cells[row];
    if (!rowCells) return; // provably never fires: row is always a valid grid index
    if (memoFlags.size > 0) {
      const cell = rowCells[col];
      if (!cell) return; // provably never fires: col is always a valid grid index
      // Tapping an already-revealed tile while memo is open does nothing
      // — same DP_BOX03 thunk as the non-memo case.
      if (cell.isFlipped) {
        if (!muted) void sfx.invalidTap();
        return;
      }
      // Apply the selected memo flag to the tile. memoFlags is radio
      // (≤1 entry) — voltorb_flip.c only ever toggles one flag per tap
      // (VoltorbFlip_TryToggleCardMemo takes a single memoId). The loop
      // is kept since flagCell already toggles, but it runs at most
      // once. HG/SS plays DP_BOX01 each time a memo flag lands on a tile.
      if (!muted) void sfx.memoToggle();
      updateGame((g) => {
        for (const f of memoFlags) g.flagCell(row, col, f);
      });
      return;
    }
    const cell = rowCells[col];
    if (!cell) return; // provably never fires: col is always a valid grid index
    // Already-flipped tile: HG/SS plays an "invalid action" thunk and
    // does nothing. Mirror that here.
    if (cell.isFlipped) {
      if (!muted) void sfx.invalidTap();
      return;
    }
    // Visual: voltorbs explode, every coin tile (1/2/3) sparkles.
    // Audio: HG/SS plays PANERU_MEKURU on every flip, and overlays
    // COIN_HAZURE (the buzzer) only when the revealed tile is a Voltorb.
    const kind: "bomb" | "coin" = cell.value === "V" ? "bomb" : "coin";
    // Risk pre-check — voltorb_flip.c:905 plays ME_CARDGAME1 when the
    // row/col still has ≥75% voltorb density among unflipped tiles.
    // We additionally suppress on deterministic rows/cols: a 0-voltorb
    // direction means the tile is a guaranteed coin, and a 100%-voltorb
    // direction means it's a guaranteed Voltorb — in either case the
    // outcome isn't "uncertain", so the warning would just feel wrong.
    const N = game.cells.length;
    const colCells = game.cells.map((r) => r[col]).filter((c): c is Cell => c !== undefined);
    const flippedInRow = rowCells.filter((c) => c.isFlipped).length;
    const flippedInCol = colCells.filter((c) => c.isFlipped).length;
    const voltorbsInRow = game.rowValues[row]?.voltorbs ?? 0;
    const voltorbsInCol = game.colValues[col]?.voltorbs ?? 0;
    const remainingRow = Math.max(1, N - flippedInRow);
    const remainingCol = Math.max(1, N - flippedInCol);
    const rowRisk = (voltorbsInRow * 100) / remainingRow;
    const colRisk = (voltorbsInCol * 100) / remainingCol;
    const definitive = rowRisk === 0 || rowRisk === 100 || colRisk === 0 || colRisk === 100;
    const highRisk = !definitive && (rowRisk >= 75 || colRisk >= 75);

    onFirstInteraction();

    const commitFlip = () => {
      if (theme) {
        const id = nextId.current++;
        const onDone = () => setEffects((prev) => prev.filter((x) => x.id !== id));
        setEffects((prev) => [...prev, { id, kind, row, col, onDone }]);
      }
      if (!muted) {
        void sfx.flip();
        if (kind === "bomb") {
          // Stagger the buzzer so the flip click is audible first.
          window.setTimeout(() => void sfx.voltorbPop(), 140);
        }
      }
      updateGame((g) => g.flipCell(row, col));
    };

    if (highRisk) {
      // Lock the board, shake the targeted tile, fire the fanfare, wait
      // for it to finish, then pause 500ms before committing the flip.
      // sfx.riskWarning() returns a promise that resolves on the audio
      // element's `ended` event, so the reveal lands cleanly after the
      // music — works for voltorb and coin tiles alike.
      warningTileRef.current = { row, col };
      setWarningTile({ row, col });
      const release = () => {
        warningTileRef.current = null;
        setWarningTile(null);
        commitFlip();
      };
      if (!muted) {
        void sfx.riskWarning().then(() => {
          window.setTimeout(release, 500);
        });
      } else {
        // Muted — match the canonical fanfare length so timing stays
        // consistent regardless of audio state.
        window.setTimeout(release, 2100);
      }
      return;
    }

    commitFlip();
  }

  const flipCardsUp = useCallback(() => {
    // HG/SS plays the panel-flip SE once at the start of RevealBoard_Main
    // (voltorb_flip.c:1077) — covers the win/lose whole-board reveal.
    if (!muted) void sfx.flip();
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        setCardsFlipped((prev) => prev.map(() => ({ isFlipped: true })));
        resolve();
      }, 1000);
    });
  }, [muted]);

  const flipCardsDown = useCallback(
    (delay = 1500, onStart?: () => void) => {
      const columns = [
        [0, 5, 10, 15, 20],
        [1, 6, 11, 16, 21],
        [2, 7, 12, 17, 22],
        [3, 8, 13, 18, 23],
        [4, 9, 14, 19, 24],
      ];

      setTimeout(() => {
        // Fire onStart at the exact frame the first column begins flipping
        // — keeps the level-up/down flash + SE in lockstep with the cards.
        onStart?.();
        let stagger = 0;
        for (let col = 0; col < 5; col++) {
          setTimeout(() => {
            // PANERU_MEKURU once per column (not per card) — the cards in
            // a column flip together, so a single SE matches the visual.
            if (!muted) void sfx.flip();
            const activeColumn = columns[col];
            if (!activeColumn) return; // provably never fires: col < 5 === columns.length
            setCardsFlipped((prev) =>
              prev.map((card, index) =>
                activeColumn.includes(index) ? { isFlipped: false } : card,
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
    [updateGame, muted],
  );

  useEffect(() => {
    setCardsFlipped(() => game.cells.flat().map((cell) => ({ isFlipped: cell.isFlipped })));
  }, [game.cells]);

  useEffect(() => {
    if (game.gameStatus === "win") {
      // Win sequence (mirrors voltorb_flip.c WinRound_Main → AwardCoins_Main):
      //   1. flipCardsUp                     — reveal the entire board
      //   2. MUSHITORI3 fanfare (or silent)  — handled by playLevelWin
      //   3. parent's runPostFanfare         — payout BGM + counter SE chain
      //   4. onFlipDownStart("up")           — level-up flash + SLOT01 SE
      //   5. flipCardsDown                   — fold cards, restartGame fires
      void flipCardsUp().then(async () => {
        // 2. Fanfare (or silent equivalent).
        await new Promise<void>((resolve) => {
          if (muted) {
            window.setTimeout(resolve, 1500);
          } else {
            const fallback = window.setTimeout(resolve, 4000);
            playLevelWin(() => {
              window.clearTimeout(fallback);
              resolve();
            });
          }
        });
        // 3. Coin payout chain (BGM 64 + per-tick SE) lives in the parent.
        if (runPostFanfare) {
          await runPostFanfare();
        }
        // 4 + 5. Cards flip down with the SLOT01 flash fired at the
        //         same frame as the first column — keeps SE/visual in
        //         lockstep instead of leading by the 100ms head delay.
        flipCardsDown(100, () => onFlipDownStart?.("up"));
      });
    } else if (game.gameStatus === "lose") {
      // Lose sequence: reveal → CARDGAME2 fanfare via playGameOver (parent)
      // → wait for click (or instant) → level-down flash synchronized to
      // the first card folding back down.
      void flipCardsUp().then(async () => {
        if (waitForClick) {
          await waitForUserInteraction();
        }
        flipCardsDown(100, () => onFlipDownStart?.("down"));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.gameStatus]);

  const N = game.cells.length;

  return (
    <div
      className={`svf-board-frame ${peek ? "svf-peek" : ""} relative border-4 border-white bg-[#448563] p-1.5 shadow-[0_4px_0_rgba(0,0,0,0.18),0_8px_24px_rgba(0,0,0,0.25)] outline outline-2 outline-gray-600`}
      style={{ "--svf-n": N } as React.CSSProperties}
    >
      <div className="flex h-full w-full rounded-xl bg-[#58a66c] p-2">
        <div className="flex flex-col gap-[var(--svf-gap)]">
          <div className="flex gap-[var(--svf-gap)]">
            <div
              className="relative grid gap-[var(--svf-gap)]"
              style={{
                gridTemplateColumns: `repeat(${N}, var(--svf-tile))`,
              }}
            >
              {game.cells.flat().map((cell, i) => {
                const coordinate = indexToCoordinate(i, N);
                return (
                  <Card
                    key={i}
                    row={coordinate[0]}
                    col={coordinate[1]}
                    isFlipped={peek || cardsFlipped[i]?.isFlipped}
                    flipCard={() => handleFlip(coordinate[0], coordinate[1])}
                    flags={peek || cell.isFlipped ? undefined : cell.flags}
                    warning={
                      warningTile?.row === coordinate[0] && warningTile?.col === coordinate[1]
                    }
                  >
                    {cell.value === "V" ? (
                      // tile/voltorb.png is upstream's srcTile0 (22×22 with
                      // salmon + voltorb body baked in, matching the
                      // voltorb-tile region embedded in each explode_*.png
                      // frame). Using it here makes the post-explosion
                      // static voltorb pixel-identical in size and style
                      // to the voltorb shown during the destruction frames,
                      // eliminating the snap on overlay unmount.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src="/games/super-voltorb-flip/sprites/upstream/tile/voltorb.png"
                        alt=""
                        className="picture-outline voltorb"
                        style={{
                          imageRendering: "pixelated",
                          width: "calc(var(--svf-tile) * 0.95)",
                          height: "calc(var(--svf-tile) * 0.95)",
                          maxWidth: "none",
                          maxHeight: "none",
                          display: "block",
                        }}
                      />
                    ) : (
                      cell.value
                    )}
                  </Card>
                );
              })}

              {game.colValues.map((col, index) => (
                <RowColCard coins={col.coins} voltorbs={col.voltorbs} key={index} index={index} />
              ))}

              {theme &&
                effects.map((e) => {
                  const Comp = e.kind === "bomb" ? theme.BombFlip : theme.CoinReveal;
                  return (
                    <div
                      key={e.id}
                      className="pointer-events-none absolute"
                      style={{
                        left: `calc(${e.col} * (var(--svf-tile) + var(--svf-gap)))`,
                        top: `calc(${e.row} * (var(--svf-tile) + var(--svf-gap)))`,
                        width: "var(--svf-tile)",
                        height: "var(--svf-tile)",
                        zIndex: 20,
                      }}
                    >
                      <Comp row={e.row} col={e.col} onDone={e.onDone} />
                    </div>
                  );
                })}
            </div>
            <div className="flex flex-col gap-[var(--svf-gap)]">
              {game.rowValues.map((row, index) => (
                <RowColCard coins={row.coins} voltorbs={row.voltorbs} key={index} index={index} />
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
      <div className="rounded-5 grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 border-2 border-gray-300 bg-white px-2 py-1 outline outline-2 outline-gray-600 sm:border-4">
        <CoinSpinner size={28} />
        <div className="drop-shadow-soft text-center text-sm leading-4 text-gray-600 sm:text-3xl sm:leading-7">
          Total
          <br />
          Coins
        </div>
        <p
          className={`${scoreFont.className} drop-shadow-soft flex text-3xl text-gray-700 sm:text-6xl`}
        >
          {totalScore
            .toString()
            .padStart(5, "0")
            .split("")
            .map((d, i) => (
              <span key={i} className="inline-block text-center" style={{ width: "0.5em" }}>
                {d}
              </span>
            ))}
        </p>
      </div>
      <div className="rounded-5 grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 border-2 border-gray-300 bg-white px-2 py-1 outline outline-2 outline-gray-600 sm:border-4">
        <CoinSpinner size={28} />
        <div className="drop-shadow-soft text-center text-sm leading-4 text-gray-600 sm:text-3xl sm:leading-7">
          This
          <br />
          Game
        </div>
        <p
          className={`${scoreFont.className} drop-shadow-soft flex text-3xl text-gray-700 sm:text-6xl`}
        >
          {currentScore
            .toString()
            .padStart(5, "0")
            .split("")
            .map((d, i) => (
              <span key={i} className="inline-block text-center" style={{ width: "0.5em" }}>
                {d}
              </span>
            ))}
        </p>
      </div>
    </div>
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

const InstructionsModal = ({ language, setModalOpen }: InstructionsModalProps) => {
  const { howToPlayTitle, instructions, tipsTitle, tips } = translations[language];

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
        className="svf-modal-card rounded-5 my-auto w-full max-w-[460px] cursor-default border-4 border-gray-300 bg-white text-gray-700 outline outline-2 outline-gray-600"
      >
        <div className="flex items-center justify-between border-b-2 border-gray-200 px-4 py-2">
          <div className="flex items-center gap-2">
            <PokeballIcon size={20} />
            <h1 className="drop-shadow-soft text-2xl leading-none">{howToPlayTitle}</h1>
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

        <div className="drop-shadow-soft flex flex-col gap-4 p-4 text-base leading-snug">
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

function DebugPanel({
  size,
  onSizeChange,
  onWinLevel,
  peek,
  onPeekToggle,
}: {
  size: number;
  onSizeChange: (n: number) => void;
  onWinLevel: () => void;
  peek: boolean;
  onPeekToggle: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open debug panel"
        title="Debug panel"
        className="fixed right-3 bottom-3 z-50 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/70 px-3 py-1.5 font-mono text-xs text-white/80 shadow-lg backdrop-blur hover:bg-black/85"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M19.14 12.94a7.49 7.49 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.13.55-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.67 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.05.31-.08.62-.08.94s.03.63.08.94L2.79 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.33.68.22l2.39-.96c.49.39 1.04.7 1.62.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.58-.24 1.13-.55 1.62-.94l2.39.96c.26.11.54.02.68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.19-1.58ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
        </svg>
        debug
      </button>
    );
  }

  return (
    <div
      className="fixed right-3 bottom-3 z-50 w-64 rounded-lg border border-white/20 bg-black/85 p-3 font-mono text-xs text-white shadow-xl backdrop-blur"
      role="dialog"
      aria-label="Debug panel"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <span className="font-bold tracking-widest uppercase">Debug</span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close debug panel"
          className="rounded px-2 text-lg leading-none text-white/60 hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
      </div>

      <div className="space-y-3 pt-3">
        <div>
          <div className="mb-1 text-white/60">Grid size</div>
          <div className="flex gap-1">
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
              const active = size === n;
              return (
                <button
                  key={n}
                  onClick={() => onSizeChange(n)}
                  aria-pressed={active}
                  className={`flex-1 rounded border py-1 font-bold transition-colors ${
                    active
                      ? "border-emerald-300 bg-emerald-400/20 text-emerald-100"
                      : "border-white/20 text-white/70 hover:border-white/50 hover:text-white"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={onWinLevel}
          className="w-full rounded border border-emerald-400/40 bg-emerald-500/15 py-1.5 font-bold text-emerald-200 transition-colors hover:bg-emerald-500/25"
        >
          Win current level
        </button>

        <label className="flex cursor-pointer items-center justify-between gap-2">
          <span>Peek tiles (no flip)</span>
          <input
            type="checkbox"
            checked={peek}
            onChange={onPeekToggle}
            className="h-3.5 w-3.5 accent-emerald-400"
          />
        </label>

        <p className="border-t border-white/10 pt-2 text-[10px] leading-snug text-white/40">
          Tile composition is generated per (size, level); x3 count is capped so the max score stays
          playable at any N. Every board is winnable.
        </p>
      </div>
    </div>
  );
}

export function SuperVoltorbFlipGame() {
  const { game, updateGame, size, setGameSize } = useGame();
  const [peek, setPeek] = useState(false);
  const [muted, toggleMute] = useMute();
  const svfRootRef = useRef<HTMLDivElement | null>(null);
  const [fullscreenActive, toggleFullscreen] = useFullscreen(svfRootRef);
  // Hidden by default; revealed after 10 taps on the mute button (Konami-style
  // unlock so debug knobs aren't visible to normal players).
  const [debugVisible, setDebugVisible] = useState(false);
  const muteTapCountRef = useRef(0);
  const handleMuteToggle = () => {
    toggleMute();
    muteTapCountRef.current += 1;
    if (muteTapCountRef.current >= 10 && !debugVisible) {
      setDebugVisible(true);
    }
  };
  const [memoFlags, setMemoFlags] = useState<MemoFlagSet>(() => new Set<MemoFlag>());
  const toggleMemoFlag = (f: MemoFlag) => {
    // HG/SS plays DP_SELECT whenever the memo cursor changes button.
    if (!muted) void sfx.cursorMove();
    // Radio-style — voltorb_flip.c's VoltorbFlip_TryToggleCardMemo takes
    // exactly one memoId per tap. Picking a new button replaces the
    // previous selection; tapping the same one twice deselects it.
    setMemoFlags((prev) => {
      if (prev.has(f)) return new Set<MemoFlag>();
      return new Set<MemoFlag>([f]);
    });
  };
  const clearMemoFlags = useCallback(() => {
    // The "Back" pad button in the memo overlay (HG/SS DP_BUTTON3).
    if (!muted) void sfx.backButton();
    setMemoFlags(new Set<MemoFlag>());
  }, [muted]);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const musicStartedRef = useRef(false);

  // Smoothly-rolled scoreboard values. Default to the live game values; the
  // payout animation overrides them while a round wraps up. Reading game
  // state via optional chaining since Gameboard mounts before the first
  // restart settles.
  const [displayTotal, setDisplayTotal] = useState(0);
  const [displayCurrent, setDisplayCurrent] = useState(0);
  // Level-card flash. "up" flashes green, "down" flashes red, both clear
  // automatically once the SE finishes.
  const [levelDir, setLevelDir] = useState<"up" | "down" | null>(null);
  const prevLevelRef = useRef<number | undefined>(undefined);
  const payoutAnimRef = useRef(false);
  const tallyTimerRef = useRef<number | null>(null);
  const tallyStepRef = useRef<number>(0);
  const prevCurrentScoreRef = useRef<number>(0);
  const skipPayoutRef = useRef(false);
  // Held back from game.currentLevel during win/lose so the visible Lv
  // value stays put while the fanfare + drain run; the new level is set
  // here in the same beat as the flash + SE inside flipCardsDown.
  const [displayLevel, setDisplayLevel] = useState<number>(() => 1);

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

  // Roll displayed scores toward the live game values. When currentScore
  // climbs (player flipped a 2x/3x tile), tick up one coin per frame at
  // ~60Hz (matches NDS frame rate; voltorb_flip.c runs the counter from
  // its main loop) and play the OKOZUKAI counter SE every 4 frames —
  // the cadence used by the original "Coins received" banner, surfaced
  // here so each multiplier reveal feels rewarding. Drops (restart,
  // voltorb-zero) snap. Once a round ends (gameStatus leaves "playing"
  // / "memo") we stop ticking so the rollup doesn't overlap the fanfare
  // or drain SE — runPostFanfare owns both displays from there.
  useEffect(() => {
    if (!game) return;
    if (payoutAnimRef.current) return;

    const status = game.gameStatus;
    if (status !== "playing" && status !== "memo") {
      if (tallyTimerRef.current) {
        window.clearTimeout(tallyTimerRef.current);
        tallyTimerRef.current = null;
      }
      return;
    }

    const targetCurrent = game.currentScore;
    const targetTotal = game.totalScore;

    const scheduled: number[] = [];
    const schedule = (fn: () => void) => {
      scheduled.push(window.setTimeout(fn, 0));
    };

    if (displayTotal !== targetTotal) {
      schedule(() => setDisplayTotal(targetTotal));
    }

    if (displayCurrent >= targetCurrent) {
      tallyStepRef.current = 0;
      if (displayCurrent !== targetCurrent) {
        schedule(() => setDisplayCurrent(targetCurrent));
      }
      return () => scheduled.forEach((id) => window.clearTimeout(id));
    }

    // Stride scales with the rollup target (matches the drain formula),
    // so a 1→500 climb takes ~100 ticks instead of dragging out the
    // last 100 coins one at a time as a gap-based stride would.
    const stride = Math.max(1, Math.ceil(targetCurrent / 100));
    tallyTimerRef.current = window.setTimeout(() => {
      tallyTimerRef.current = null;
      setDisplayCurrent((prev) => Math.min(prev + stride, targetCurrent));
      const step = tallyStepRef.current;
      if (!muted && step % 4 === 0) void sfx.payoutTickEarn();
      tallyStepRef.current = step + 1;
    }, 17);

    return () => {
      scheduled.forEach((id) => window.clearTimeout(id));
      if (tallyTimerRef.current) {
        window.clearTimeout(tallyTimerRef.current);
        tallyTimerRef.current = null;
      }
    };
  }, [
    game,
    game?.currentScore,
    game?.totalScore,
    game?.gameStatus,
    displayCurrent,
    displayTotal,
    muted,
  ]);

  // Release the post-payout freeze when restartGame zeroes currentScore.
  // We hold payoutAnimRef.current=true through flipCardsDown / level-flash
  // so the rollup effect doesn't try to re-tick from 0 → earned while the
  // old round's currentScore is still non-zero.
  useEffect(() => {
    if (!game) return;
    const prev = prevCurrentScoreRef.current;
    if (prev > 0 && game.currentScore === 0 && payoutAnimRef.current) {
      payoutAnimRef.current = false;
    }
    prevCurrentScoreRef.current = game.currentScore;
  }, [game, game?.currentScore]);

  // Hold the visible Lv value at its old number while a round is wrapping
  // up (win/lose). The game already advances currentLevel as soon as the
  // round ends, but the player shouldn't *see* it change until the
  // flip-down animation runs — that's when the flash + SLOT01/03 SE fire.
  // While playing/memo, displayLevel mirrors game.currentLevel.
  useEffect(() => {
    if (!game) return;
    const status = game.gameStatus;
    let syncLevelTimer: number | null = null;

    if (status === "playing" || status === "memo") {
      if (displayLevel !== game.currentLevel) {
        syncLevelTimer = window.setTimeout(() => setDisplayLevel(game.currentLevel), 0);
      }
    }
    prevLevelRef.current = game.currentLevel;

    return () => {
      if (syncLevelTimer) window.clearTimeout(syncLevelTimer);
    };
  }, [game, game?.currentLevel, game?.gameStatus, displayLevel]);

  const triggerLevelTransition = useCallback(
    (dir: "up" | "down") => {
      if (!game) return;
      const newLevel = game.currentLevel;
      const oldLevel = displayLevel;
      // Skip when the level didn't actually move — e.g. lose at Lv 1
      // floors at 1, win at Lv 8 caps at 8. No flash, no SE.
      if (newLevel === oldLevel) return;
      setDisplayLevel(newLevel);
      setLevelDir(dir);
      if (!muted) {
        if (dir === "up") void sfx.levelUp();
        else void sfx.levelDown();
      }
      window.setTimeout(() => setLevelDir(null), 1200);
    },
    [game, muted, displayLevel],
  );

  // Click anywhere during the post-round drain to skip the counter.
  // Pointerdown so it covers both mouse and touch. Gated on payoutAnimRef
  // so tile clicks during normal play are unaffected.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      if (payoutAnimRef.current) skipPayoutRef.current = true;
    };
    window.addEventListener("pointerdown", handler);
    return () => window.removeEventListener("pointerdown", handler);
  }, []);

  // Promise-returning post-fanfare runner: drains the round's "This Game"
  // pot into "Total Coins". Phase 1 (the OKOZUKAI tally-up) is now driven
  // by the per-flip rollup effect above so the player hears each coin as
  // they collect it; here we only run Phase 2 — COIN_PAYOUT_ONE per 4
  // ticks, COIN_PAYOUT_LAST closes the chain. Matches voltorb_flip.c
  // AwardCoins_Main step 2; the BGM scene swap is a JP-only Game-Corner
  // detail and the NA build lets gameplay BGM ride through.
  const runPostFanfare = useCallback(async () => {
    if (!game) return;
    const finalTotal = game.totalScore;
    const finalCurrent = game.currentScore;
    const startTotal = Math.max(0, finalTotal - finalCurrent);
    const earned = finalCurrent;
    if (earned <= 0) return;

    skipPayoutRef.current = false;
    payoutAnimRef.current = true;
    // Cancel any in-flight per-flip tally-up — earned has already been
    // heard during play; we own the displays from here.
    if (tallyTimerRef.current) {
      window.clearTimeout(tallyTimerRef.current);
      tallyTimerRef.current = null;
    }
    // Snap to the round-end read in case the rollup didn't finish before
    // the level-clear fanfare ended (covers wins on a final huge multiplier).
    setDisplayCurrent(earned);
    setDisplayTotal(startTotal);
    // Beat of pause so the player can read the earned amount before drain.
    // Pollable in 60ms slices so skipping during the pause works too.
    {
      const pauseEnd = Date.now() + 320;
      while (Date.now() < pauseEnd && !skipPayoutRef.current) {
        await new Promise<void>((r) => window.setTimeout(r, 60));
      }
    }

    // 17ms/step ≈ NDS 60Hz frame rate; SE every 4 steps matches
    // COIN_PAYOUT_ONE cadence in voltorb_flip.c:1381. We cap the loop
    // at MAX_ITERATIONS so a 10k-coin haul doesn't take 170s — instead
    // each iteration drains ceil(earned / 100) coins. That keeps total
    // drain time bounded at ~1.7s regardless of how big "earned" is,
    // while small earnings still tick one coin per step like HG/SS.
    const tickMs = 17;
    const MAX_ITERATIONS = 100;
    const coinsPerTick = Math.max(1, Math.ceil(earned / MAX_ITERATIONS));
    const iterations = Math.ceil(earned / coinsPerTick);
    const tick = () => new Promise<void>((r) => window.setTimeout(r, tickMs));

    let didSkip = false;
    let drained = 0;
    for (let j = 0; j < iterations; j++) {
      if (skipPayoutRef.current) {
        didSkip = true;
        break;
      }
      drained = Math.min(earned, drained + coinsPerTick);
      setDisplayCurrent(earned - drained);
      setDisplayTotal(startTotal + drained);
      if (j % 4 === 0 && !muted) void sfx.payoutTickBank();
      await tick();
    }
    // Snap to final wallet state — covers both natural completion and skip.
    setDisplayCurrent(0);
    setDisplayTotal(startTotal + earned);
    // COIN_PAYOUT_LAST always closes the chain, including on skip — the
    // closing chime is the audible "money's in the bank" cue and should
    // fire whether the player let it run or tapped through.
    if (!muted) void sfx.payoutFinal();
    // Breathing room so payoutFinal doesn't bleed into the level-up SE.
    // Shorter on skip so it still feels snappy.
    await new Promise<void>((r) => window.setTimeout(r, didSkip ? 160 : 280));
    skipPayoutRef.current = false;

    // Hold payoutAnimRef.current=true through onFlipDownStart / flipCardsDown.
    // The release effect above flips it back to false the instant
    // restartGame zeroes currentScore, so the rollup effect doesn't try
    // to re-tick 0 → earned while the round's old score lingers.
  }, [game, muted]);

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
  }, [game, game?.currentLevel, game?.totalScore]);

  // Reset memo mode + drive music/game-over audio on status transitions.
  // restartGame sets status back to "playing" after cards flip down.
  const prevGameStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!game) return;
    const prev = prevGameStatusRef.current;
    const cur = game.gameStatus;
    let clearMemoTimer: number | null = null;

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
      clearMemoTimer = window.setTimeout(() => clearMemoFlags(), 0);
      stopGameOver();
      stopLevelWin();
      if (!muted) {
        musicStartedRef.current = true;
        playMusic();
      }
    }
    prevGameStatusRef.current = cur;

    return () => {
      if (clearMemoTimer) window.clearTimeout(clearMemoTimer);
    };
  }, [game, game?.gameStatus, muted, clearMemoFlags]);

  function handleFirstInteraction() {
    if (!musicStartedRef.current && !muted) {
      musicStartedRef.current = true;
      playMusic();
    }
  }

  // Try autoplay on mount. Some browsers block this until the user has
  // interacted with the page; if so, the audio.play().catch in playMusic
  // swallows the rejection and handleFirstInteraction starts it on the
  // first click. We still mark musicStartedRef so we don't double-start.
  useEffect(() => {
    if (muted) return;
    musicStartedRef.current = true;
    playMusic();
  }, [muted]);

  return (
    <>
      {debugVisible && (
        <DebugPanel
          size={size}
          onSizeChange={setGameSize}
          onWinLevel={() => updateGame((g) => g.debugWinLevel())}
          peek={peek}
          onPeekToggle={() => setPeek((v) => !v)}
        />
      )}
      <EffectsProvider>
        <div
          ref={svfRootRef}
          className={`svf-root relative ${pokemonFont.variable} ${numberFont.variable} ${scoreFont.variable} ${pokemonFont.className} flex flex-col items-center p-1 text-white sm:p-2 lg:grid lg:grid-cols-[auto_1fr] lg:items-start lg:gap-4`}
        >
          <style>{SCOPED_STYLES}</style>

          {howToPlayOpen && <InstructionsModal language="en" setModalOpen={setHowToPlayOpen} />}

          {/* Desktop / tablet left column (sm+ only). Holds everything except
            the board so the right column can devote full width to tiles. */}
          <div className="hidden flex-col items-center gap-2 lg:flex">
            <div className="flex w-full items-center gap-2">
              <InstructionsBtns onOpen={() => setHowToPlayOpen(true)} />
              <PixelMuteButton muted={muted} onToggle={handleMuteToggle} size={44} />
              <PixelFullscreenButton
                active={fullscreenActive}
                onToggle={toggleFullscreen}
                size={44}
              />
              {game && (
                <div
                  className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-[6px] border-2 border-white bg-[#448563] px-3 outline outline-2 outline-gray-600 drop-shadow-default${
                    levelDir === "up"
                      ? "svf-lv-flash-up"
                      : levelDir === "down"
                        ? "svf-lv-flash-down"
                        : ""
                  }`}
                >
                  <span className="text-xs font-bold tracking-widest text-white/80 uppercase">
                    Lv
                  </span>
                  <span className="text-lg leading-none font-black">{displayLevel}</span>
                  <span className="text-sm text-white/70">VOLTORB Flip</span>
                </div>
              )}
            </div>
            <div className="flex w-full">
              <MemoBar
                activeFlags={memoFlags}
                onToggle={toggleMemoFlag}
                onClear={clearMemoFlags}
                size={32}
                fullWidth
              />
            </div>
            {game && <Scoreboard currentScore={displayCurrent} totalScore={displayTotal} />}
          </div>

          {/* Right column: board + footer (and mobile bar at <lg, sized
            to match board width). */}
          <div className="flex flex-col items-center gap-2">
            {game && (
              <div className="flex w-full flex-col gap-1.5 lg:hidden">
                <div className="flex items-stretch gap-2 rounded-[6px] border-2 border-gray-300 bg-white px-2 py-1 text-gray-700 outline outline-2 outline-gray-600">
                  <div
                    className={`flex items-center justify-center gap-1.5 rounded-[3px] bg-[#448563] px-2 leading-none text-white${
                      levelDir === "up"
                        ? "svf-lv-flash-up"
                        : levelDir === "down"
                          ? "svf-lv-flash-down"
                          : ""
                    }`}
                  >
                    <span className="text-xs font-bold tracking-widest text-white/80 uppercase">
                      Lv
                    </span>
                    <span className="text-xl font-black">{displayLevel}</span>
                  </div>
                  <div className="flex flex-1 items-center justify-around gap-2">
                    <div className="flex flex-col items-center gap-0.5 leading-none">
                      <div className="flex items-center gap-1">
                        <CoinSpinner size={14} />
                        <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                          Total Coins
                        </span>
                      </div>
                      <span className={`${scoreFont.className} flex text-xl`}>
                        {displayTotal
                          .toString()
                          .padStart(5, "0")
                          .split("")
                          .map((d, i) => (
                            <span
                              key={i}
                              className="inline-block text-center"
                              style={{ width: "0.5em" }}
                            >
                              {d}
                            </span>
                          ))}
                      </span>
                    </div>
                    <div className="h-8 w-[2px] bg-gray-200" />
                    <div className="flex flex-col items-center gap-0.5 leading-none">
                      <div className="flex items-center gap-1">
                        <CoinSpinner size={14} />
                        <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                          This Game
                        </span>
                      </div>
                      <span className={`${scoreFont.className} flex text-xl`}>
                        {displayCurrent
                          .toString()
                          .padStart(5, "0")
                          .split("")
                          .map((d, i) => (
                            <span
                              key={i}
                              className="inline-block text-center"
                              style={{ width: "0.5em" }}
                            >
                              {d}
                            </span>
                          ))}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <InstructionsBtns onOpen={() => setHowToPlayOpen(true)} />
                    <PixelMuteButton muted={muted} onToggle={handleMuteToggle} size={44} />
                    <PixelFullscreenButton
                      active={fullscreenActive}
                      onToggle={toggleFullscreen}
                      size={44}
                    />
                  </div>
                  <MemoBar
                    activeFlags={memoFlags}
                    onToggle={toggleMemoFlag}
                    onClear={clearMemoFlags}
                    size={28}
                    showLabel={false}
                  />
                </div>
              </div>
            )}
            {game && (
              <>
                <Gameboard
                  game={game}
                  updateGame={updateGame}
                  waitForClick
                  muted={muted}
                  onFirstInteraction={handleFirstInteraction}
                  memoFlags={memoFlags}
                  peek={peek}
                  runPostFanfare={runPostFanfare}
                  onFlipDownStart={triggerLevelTransition}
                />
                <Footer />
              </>
            )}
          </div>
        </div>
      </EffectsProvider>
    </>
  );
}
