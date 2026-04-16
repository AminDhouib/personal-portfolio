"use client";

import { CoinDigits } from "./Digits";

const ASSETS = "/games/super-voltorb-flip/sprites";

export const SCOREBOARD_HEIGHT = 40;

/**
 * "Coins Collected in Current Game" frame with 5 big-digit coin display.
 * Digit y-coord within this slice is 17 (original y=157 minus slice top y=140).
 */
export function CurrentScoreboard({ value }: { value: number }) {
  return (
    <div
      style={{
        position: "relative",
        width: 262,
        height: SCOREBOARD_HEIGHT,
        backgroundImage: `url(${ASSETS}/chrome/scoreboard-current.png)`,
        imageRendering: "pixelated",
      }}
    >
      <CoinDigits value={value} baseX={236} y={17} />
    </div>
  );
}
