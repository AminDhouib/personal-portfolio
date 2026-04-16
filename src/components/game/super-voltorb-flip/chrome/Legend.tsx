"use client";

const ASSETS = "/games/super-voltorb-flip/sprites";

export const LEGEND_HEIGHT = 30;

/**
 * Static legend row: the 1/2/3 value tiles next to "...x1!  ...x2!  ...x3!".
 * Pure chrome — no dynamic content.
 */
export function Legend() {
  return (
    <div
      style={{
        width: 262,
        height: LEGEND_HEIGHT,
        backgroundImage: `url(${ASSETS}/chrome/legend.png)`,
        imageRendering: "pixelated",
      }}
    />
  );
}
