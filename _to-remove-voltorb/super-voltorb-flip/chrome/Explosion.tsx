"use client";

const ASSETS = "/games/super-voltorb-flip/sprites";

const PIXEL: React.CSSProperties = {
  imageRendering: "pixelated",
  display: "block",
  userSelect: "none",
  pointerEvents: "none",
};

/**
 * Explosion is its own overlay so the underlying tile (the revealed Voltorb
 * sprite) shows through during the animation. Frame mapping mirrors the
 * original samualtnorman timing: 9 sprite frames spread across animFrame
 * 19..82 (~7 ticks per visible frame).
 *
 * Background pixels in the explode_*.png sprites are knocked out via
 * scripts/strip-sprite-bg.py so the underlying tile face shows through
 * the gaps in the explosion cloud.
 */
export function Explosion({ animFrame }: { animFrame: number }) {
  if (animFrame < 19) return null;
  const frame = Math.min(8, Math.floor((animFrame - 19) / 7));
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${ASSETS}/tile/explode_${frame}.png`}
      alt=""
      draggable={false}
      style={{
        ...PIXEL,
        position: "absolute",
        inset: 0,
        width: 22,
        height: 22,
      }}
    />
  );
}
