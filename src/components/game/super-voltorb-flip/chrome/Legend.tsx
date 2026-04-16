"use client";

import { dsFont } from "./ds-font";

const ASSETS = "/games/super-voltorb-flip/sprites";

export const LEGEND_HEIGHT = 30;

/**
 * Legend row: the 1/2/3 value-tile thumbnails stay baked in the chrome
 * (they're actual tile-face sprites in the original), but the
 * "...x1! ...x2! ...x3!" multiplier text is React-rendered and comes from
 * theme config so it can be re-phrased per skin.
 */
export function Legend({ multipliers }: { multipliers: string }) {
  return (
    <div
      style={{
        position: "relative",
        width: 262,
        height: LEGEND_HEIGHT,
        backgroundImage: `url(${ASSETS}/chrome/legend-frame.png)`,
        imageRendering: "pixelated",
      }}
    >
      <div
        className={dsFont.className}
        aria-label={multipliers}
        style={{
          position: "absolute",
          left: 96,
          top: 3,
          width: 160,
          height: 24,
          display: "flex",
          alignItems: "center",
          color: "#ffffff",
          fontSize: 7,
          lineHeight: "10px",
          letterSpacing: "0.5px",
          textShadow: "1px 1px 0 rgba(0,0,0,0.35)",
          userSelect: "none",
        }}
      >
        {multipliers}
      </div>
    </div>
  );
}
