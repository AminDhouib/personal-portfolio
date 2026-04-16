"use client";

const ASSETS = "/games/super-voltorb-flip/sprites";

export const VOLTORB_MESSAGE_HEIGHT = 30;

/**
 * Static "Voltorb / Game Over! 0!" message row shown above the scoreboards.
 */
export function VoltorbMessage() {
  return (
    <div
      style={{
        width: 262,
        height: VOLTORB_MESSAGE_HEIGHT,
        backgroundImage: `url(${ASSETS}/chrome/voltorb-message.png)`,
        imageRendering: "pixelated",
      }}
    />
  );
}
