import type { ReactNode } from "react";
import {
  BURST_BOX,
  CORE_OFFSET,
  CORE_SCALE,
  SPARKLE_BOX,
  burstRects,
  coinHalfWidth,
  sparkleRects,
  type Rect,
} from "./fx";
import { ORB, spritePaths } from "./sprites";

interface FrameSize {
  /** Pixel size; ignored when cssSize is given. */
  size?: number;
  cssSize?: string;
}

function Frame({
  box,
  size,
  cssSize,
  crisp = true,
  children,
}: FrameSize & { box: number; crisp?: boolean; children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      width={cssSize ? undefined : size}
      height={cssSize ? undefined : size}
      aria-hidden="true"
      focusable="false"
      shapeRendering={crisp ? "crispEdges" : undefined}
      style={{
        display: "block",
        pointerEvents: "none",
        maxWidth: "none",
        maxHeight: "none",
        width: cssSize,
        height: cssSize,
      }}
    >
      {children}
    </svg>
  );
}

function Rects({ rects }: { rects: Rect[] }) {
  return (
    <>
      {rects.map((r, i) => (
        <rect key={`${i}:${r.x}:${r.y}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
      ))}
    </>
  );
}

/**
 * One frame of the bomb burst. `core` also draws the orb at the burst's centre,
 * for callers with no static orb underneath (the hub banner hides its orb while
 * the burst plays); in-game overlays leave it off because the revealed tile's
 * orb is already there.
 */
export function BurstFrame({
  frame,
  core = false,
  ...size
}: FrameSize & { frame: number; core?: boolean }) {
  return (
    <Frame box={BURST_BOX} {...size}>
      {core && (
        <g transform={`translate(${CORE_OFFSET} ${CORE_OFFSET}) scale(${CORE_SCALE})`}>
          {spritePaths(ORB).map((p) => (
            <path key={p.color} d={p.d} fill={p.color} />
          ))}
        </g>
      )}
      <Rects rects={burstRects(frame)} />
    </Frame>
  );
}

export function SparkleFrame({ frame, ...size }: FrameSize & { frame: number }) {
  return (
    <Frame box={SPARKLE_BOX} {...size}>
      <Rects rects={sparkleRects(frame)} />
    </Frame>
  );
}

/** One frame of the spinning coin: a gold ellipse that turns edge-on and back. */
export function CoinFrame({ frame, ...size }: FrameSize & { frame: number }) {
  const rx = coinHalfWidth(frame);
  return (
    <Frame box={16} crisp={false} {...size}>
      <ellipse cx={8} cy={8} rx={rx} ry={7} fill="#f5b82e" stroke="#9a5f0e" strokeWidth={1} />
      {rx >= 4 && (
        <>
          <ellipse cx={8} cy={8} rx={rx - 2} ry={5} fill="none" stroke="#ffe08a" strokeWidth={1} />
          <rect x={7.2} y={4.5} width={1.6} height={7} fill="#9a5f0e" />
        </>
      )}
    </Frame>
  );
}
