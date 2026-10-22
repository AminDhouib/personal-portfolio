import type { CSSProperties, ImgHTMLAttributes } from "react";
import {
  EXPLODE_FRAME_PX,
  EXPLODE_FRAME_SRCS,
  SPRITE_NO_GRAB_STYLE,
  VOLTORB_ICON_SRC,
  VOLTORB_TILE_SRC,
} from "./original-sprites";

// The one Voltorb the game draws, everywhere (T-6535): the original tile sprite and the original
// burst frames. Decorative: every place that shows it already has its own accessible name (or is
// a visual stand-in for a count), so the image carries alt="".

// eslint-disable-next-line @next/next/no-img-element -- a 22 px pixel sprite, scaled with CSS and never optimized
const Img = (props: ImgHTMLAttributes<HTMLImageElement>) => <img alt="" {...props} />;

/**
 * The Voltorb at `size` px or a CSS length, crisp at any scale. By default it is the whole
 * face-up tile (salmon square and border); `variant="icon"` is the bare body on transparency,
 * for the small icons.
 */
export function VoltorbSprite({
  variant = "tile",
  size,
  cssSize,
  className,
  style,
}: {
  variant?: "tile" | "icon";
  size?: number;
  cssSize?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Img
      src={variant === "icon" ? VOLTORB_ICON_SRC : VOLTORB_TILE_SRC}
      draggable={false}
      className={className}
      style={{
        ...SPRITE_NO_GRAB_STYLE,
        imageRendering: "pixelated",
        display: "block",
        flexShrink: 0,
        width: cssSize ?? size,
        height: cssSize ?? size,
        maxWidth: "none",
        maxHeight: "none",
        ...style,
      }}
    />
  );
}

/**
 * One frame of the original bomb burst, centred in its positioned parent. Without `cssSize` it is
 * drawn at its native pixel size, so the Voltorb baked into it is the 22 px sprite exactly; the
 * board passes a tile-relative size instead (see explodeFrameCssSize).
 */
export function ExplodeFrameImg({ frame, cssSize }: { frame: number; cssSize?: string }) {
  const native = `${EXPLODE_FRAME_PX[frame] ?? 22}px`;
  return (
    <Img
      src={EXPLODE_FRAME_SRCS[frame]}
      draggable={false}
      style={{
        ...SPRITE_NO_GRAB_STYLE,
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: cssSize ?? native,
        height: cssSize ?? native,
        maxWidth: "none",
        maxHeight: "none",
        imageRendering: "pixelated",
        pointerEvents: "none",
      }}
    />
  );
}
