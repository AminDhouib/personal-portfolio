import { useMemo, type CSSProperties } from "react";
import { spritePaths, type Sprite } from "./sprites";

// Stroke width in sprite units; half of it shows outside the fill.
const OUTLINE_WIDTH = 0.6;

/**
 * Renders a text sprite as inline SVG. Crisp edges keep the pixel look at any
 * size. Pass `size` (pixels) or `cssSize` (any CSS length, e.g. a calc over
 * --svf-tile); non-square sprites centre inside the square box. `outline`
 * draws a crisp dark edge inside the SVG (a stroke painted under the fill), so
 * no CSS filter is needed. The SVG never shrinks as a flex child.
 */
export function PixelSprite({
  sprite,
  size,
  cssSize,
  className,
  style,
  outline,
}: {
  sprite: Sprite;
  size?: number;
  cssSize?: string;
  className?: string;
  style?: CSSProperties;
  outline?: string;
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
      style={{
        display: "block",
        flexShrink: 0,
        width: cssSize,
        height: cssSize,
        ...(outline ? { overflow: "visible" } : null),
        ...style,
      }}
    >
      {paths.map((p) => (
        <path
          key={p.color}
          d={p.d}
          fill={p.color}
          stroke={outline}
          strokeWidth={outline ? OUTLINE_WIDTH : undefined}
          paintOrder={outline ? "stroke" : undefined}
        />
      ))}
    </svg>
  );
}
