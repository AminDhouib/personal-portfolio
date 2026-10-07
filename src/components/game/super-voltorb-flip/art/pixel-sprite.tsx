import { useMemo, type CSSProperties } from "react";
import { spritePaths, type Sprite } from "./sprites";

/**
 * Renders a text sprite as inline SVG. Crisp edges keep the pixel look at any
 * size. Pass `size` (pixels) or `cssSize` (any CSS length, e.g. a calc over
 * --svf-tile); non-square sprites centre inside the square box.
 */
export function PixelSprite({
  sprite,
  size,
  cssSize,
  className,
  style,
}: {
  sprite: Sprite;
  size?: number;
  cssSize?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const paths = useMemo(() => spritePaths(sprite), [sprite]);
  const width = sprite[0]?.length ?? 0;
  return (
    <svg
      viewBox={`0 0 ${width} ${sprite.length}`}
      width={cssSize ? undefined : size}
      height={cssSize ? undefined : size}
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
      className={className}
      style={{ display: "block", width: cssSize, height: cssSize, ...style }}
    >
      {paths.map((p) => (
        <path key={p.color} d={p.d} fill={p.color} />
      ))}
    </svg>
  );
}
