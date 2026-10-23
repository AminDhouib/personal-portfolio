"use client";

import React from "react";
import { numberFont } from "./fonts";
import { COLORS, type FlagValues } from "./types";
import { type TileOddsView } from "./odds-input";
import { PixelSprite } from "./art/pixel-sprite";
import { VoltorbSprite } from "./art/voltorb-sprite";
import { GLYPHS } from "./art/sprites";

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
  /**
   * Spoken form of the tile's value ("1", "Voltorb", ...), announced only once
   * the tile is revealed. Kept separate from `children` because that is markup
   * (the Voltorb face is an aria-hidden SVG, which announces nothing) and because
   * it must never reach the DOM while the tile is face down.
   */
  valueLabel?: string;
  /** Roving tabindex: 0 for the keyboard cursor's tile, -1 for the rest. */
  tabIndex?: 0 | -1;
  /** "row-col", read by the board to move focus without a ref per tile. */
  cellId?: string;
  /** Fires when the tile takes focus (keyboard, click or script) so the cursor follows. */
  onFocus?: () => void;
  /** Odds assist: the Voltorb chance shown on a face-down tile, and its spoken form. */
  odds?: TileOddsView;
};

// Two complete static class strings (never a conditional fragment) so the
// Tailwind prettier plugin cannot re-fuse the separator before the modifier.
const TILE_WRAP =
  "svf-tile-wrap relative h-[var(--svf-tile)] w-[var(--svf-tile)] cursor-pointer place-self-center [perspective:1000px]";
const TILE_WRAP_ANXIOUS =
  "svf-tile-wrap relative h-[var(--svf-tile)] w-[var(--svf-tile)] cursor-pointer place-self-center [perspective:1000px] svf-tile-anxious";

// Two complete static class strings, the suggested flip in the game's gold.
const ODDS_PILL = "rounded-[3px] bg-black/70 px-[2px] leading-none font-bold text-white";
const ODDS_PILL_BEST = "rounded-[3px] bg-[#efa539] px-[2px] leading-none font-bold text-black";

export const Card = ({
  children,
  fake,
  isFlipped,
  flipCard,
  row,
  col,
  flags,
  warning,
  valueLabel,
  tabIndex = 0,
  cellId,
  onFocus,
  odds,
}: CardProps) => {
  const rowColor = row !== undefined ? COLORS[row] : undefined;
  const colColor = col !== undefined ? COLORS[col] : undefined;
  const faceTextStyle: React.CSSProperties = { fontSize: "calc(var(--svf-tile) * 0.6)" };
  const flagSize = "calc(var(--svf-tile) * 0.34)";
  // Memo marks are part of what a screen reader hears for a face-down tile.
  const memoText = flags
    ? ([1, 2, 3, "V"] as const)
        .filter((f) => flags[f])
        .map(String)
        .join(", ")
    : "";
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
      className={warning ? TILE_WRAP_ANXIOUS : TILE_WRAP}
      role="button"
      tabIndex={tabIndex}
      data-cell={cellId}
      onFocus={onFocus}
      aria-label={
        row !== undefined && col !== undefined
          ? `Row ${row + 1}, Col ${col + 1}, ${
              isFlipped
                ? `revealed${valueLabel ? `, ${valueLabel}` : ""}`
                : `face down${memoText ? `, memo ${memoText}` : ""}${
                    odds ? `, ${odds.spoken}${odds.best ? ", suggested next flip" : ""}` : ""
                  }`
            }`
          : undefined
      }
      onClick={flipCard}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          // Space would otherwise scroll the page before the flip lands.
          e.preventDefault();
          flipCard?.();
        }
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
                  {f === "V" ? (
                    <VoltorbSprite variant="icon" cssSize={flagSize} />
                  ) : (
                    <PixelSprite
                      sprite={GLYPHS[f]}
                      cssSize={flagSize}
                      outline="#1f2937"
                      style={{ color: "#fff" }}
                    />
                  )}
                </div>
              ) : null,
            )}
          </div>
        )}
        {odds && !isFlipped && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span
              data-odds-pill=""
              className={odds.best ? ODDS_PILL_BEST : ODDS_PILL}
              style={{ fontSize: "calc(var(--svf-tile) * 0.27)" }}
            >
              {odds.text}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
