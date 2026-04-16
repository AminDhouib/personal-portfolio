"use client";

import { CoinDigits } from "./Digits";

const ASSETS = "/games/super-voltorb-flip/sprites";

export const SCOREBOARD_HEIGHT = 40;

/**
 * "Coins Collected in Current Game" frame. Uses the textless chrome slice so
 * the label is fully React-rendered and per-theme configurable.
 */
export function CurrentScoreboard({
  value,
  label,
}: {
  value: number;
  label: readonly [string, string];
}) {
  return (
    <div
      style={{
        position: "relative",
        width: 262,
        height: SCOREBOARD_HEIGHT,
        backgroundImage: `url(${ASSETS}/chrome/scoreboard-current-frame.png)`,
        imageRendering: "pixelated",
      }}
    >
      <div
        aria-label={`${label[0]} ${label[1]}`}
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
          fontFamily:
            "'Courier New', ui-monospace, Menlo, Consolas, monospace",
          fontWeight: 700,
          fontSize: 9,
          lineHeight: "10px",
          color: "#0a0a0a",
          letterSpacing: "-0.25px",
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
