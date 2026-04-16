"use client";

import { CoinDigits } from "./Digits";
import { dsFont } from "./ds-font";
import { themedAsset } from "../theme";
import type { ThemeId } from "../types";

export const SCOREBOARD_HEIGHT = 40;

/**
 * "Coins Collected in Current Game" frame. Uses the textless chrome slice so
 * the label is fully React-rendered and per-theme configurable.
 */
export function CurrentScoreboard({
  value,
  label,
  themeId,
}: {
  value: number;
  label: readonly [string, string];
  themeId: ThemeId;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: 262,
        height: SCOREBOARD_HEIGHT,
        backgroundImage: `url(${themedAsset(themeId, "chrome/scoreboard-current-frame.png")})`,
        imageRendering: "pixelated",
      }}
    >
      <div
        aria-label={`${label[0]} ${label[1]}`}
        className={dsFont.className}
        style={{
          position: "absolute",
          left: 14,
          top: 4,
          width: 144,
          height: 32,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          fontSize: 7,
          lineHeight: "10px",
          color: "#0a0a0a",
          userSelect: "none",
        }}
      >
        <span>{label[0]}</span>
        <span>{label[1]}</span>
      </div>
      <CoinDigits value={value} baseX={236} y={17} />
    </div>
  );
}
