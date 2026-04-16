"use client";

import { Digit } from "./Digits";

const ASSETS = "/games/super-voltorb-flip/sprites";

export const HEADER_HEIGHT = 40;

/**
 * Top banner: "VOLTORB Flip Lv. X / Flip the Cards and Collect Coins!".
 * Background asset is the sliced header.png; the level number is overlaid
 * at the same pixel position the original game uses (x=173, y=11).
 */
export function Header({ level }: { level: number }) {
  return (
    <div
      style={{
        position: "relative",
        width: 262,
        height: HEADER_HEIGHT,
        backgroundImage: `url(${ASSETS}/chrome/header.png)`,
        imageRendering: "pixelated",
      }}
    >
      <Digit n={level} variant="thin" x={173} y={11} />
    </div>
  );
}
