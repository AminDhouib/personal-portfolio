"use client";

import { CoinDigits } from "./Digits";

const ASSETS = "/games/super-voltorb-flip/sprites";

export const SCOREBOARD_HEIGHT = 40;

/**
 * "Total Collected Coins" frame with 5 big-digit coin display.
 * Digit y-coord within this slice is 17 (original y=117 minus slice top y=100).
 */
export function TotalScoreboard({ value }: { value: number }) {
  return (
    <div
      style={{
        position: "relative",
        width: 262,
        height: SCOREBOARD_HEIGHT,
        backgroundImage: `url(${ASSETS}/chrome/scoreboard-total.png)`,
        imageRendering: "pixelated",
      }}
    >
      <CoinDigits value={value} baseX={236} y={17} />
    </div>
  );
}
