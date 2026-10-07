"use client";

import React, { useCallback, useEffect, useState } from "react";
import { BurstFrame, CoinFrame, SparkleFrame } from "./art/frames";
import { BURST_FRAMES, COIN_FRAMES, SPARKLE_FRAMES } from "./art/fx";
import { PixelSprite } from "./art/pixel-sprite";
import { ORB } from "./art/sprites";

// ---------------------------------------------------------------------------
// The orb icon: the original spark-orb sprite (art/sprites.ts) used wherever
// the game shows its hazard, on the clue cards, in the legend and as the
// How to play icon.
// ---------------------------------------------------------------------------

export function VoltorbIcon({
  size = 28,
  cssSize,
  className,
}: {
  size?: number;
  cssSize?: string;
  className?: string;
}) {
  return <PixelSprite sprite={ORB} size={size} cssSize={cssSize} className={className} />;
}

function LoopingFrames({
  count,
  size,
  interval = 90,
  pauseMs = 0,
  render,
}: {
  count: number;
  size: number;
  interval?: number;
  pauseMs?: number;
  render: (frame: number) => React.ReactNode;
}) {
  const [frame, setFrame] = useState(0);
  // Scheduling the next tick inside the setFrame updater fires twice in
  // React Strict Mode (the updater runs twice for purity-checking), which
  // doubles up the timers and makes the loop run far faster than `interval`.
  // Keep the side effect in useEffect, keyed on `frame`.
  useEffect(() => {
    const delay = frame === 0 && pauseMs > 0 ? pauseMs : interval;
    const t = window.setTimeout(() => {
      setFrame((f) => (f + 1) % count);
    }, delay);
    return () => window.clearTimeout(t);
  }, [frame, count, interval, pauseMs]);
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        flexShrink: 0,
        width: size,
        height: size,
        pointerEvents: "none",
      }}
    >
      {render(frame)}
    </span>
  );
}

// The legend and modal draw these over a card that already shows the orb, so
// the burst carries no orb of its own.
export const LoopingExplosion = ({ size }: { size: number }) => (
  <LoopingFrames
    count={BURST_FRAMES}
    size={size}
    interval={70}
    pauseMs={500}
    render={(f) => <BurstFrame frame={f} cssSize="100%" />}
  />
);

export const LoopingSparkle = ({ size }: { size: number }) => (
  <LoopingFrames
    count={SPARKLE_FRAMES}
    size={size}
    interval={110}
    pauseMs={700}
    render={(f) => <SparkleFrame frame={f} cssSize="100%" />}
  />
);

// ---------------------------------------------------------------------------
// src/components/InstructionsBtns.tsx (1:1 port).
// ---------------------------------------------------------------------------

export const PixelMuteButton = ({
  muted,
  onToggle,
  size = 40,
}: {
  muted: boolean;
  onToggle: () => void;
  size?: number;
}) => (
  <button
    onClick={onToggle}
    aria-label={muted ? "Unmute" : "Mute"}
    title={muted ? "Unmute" : "Mute"}
    className="flex items-center justify-center rounded-[6px] border-2 border-gray-300 bg-white text-gray-700 outline outline-2 outline-gray-600 transition-colors hover:bg-zinc-100"
    style={{ width: size, height: size }}
  >
    <svg
      width={Math.round(size * 0.55)}
      height={Math.round(size * 0.55)}
      viewBox="0 0 16 16"
      style={{ imageRendering: "pixelated", shapeRendering: "crispEdges" }}
      aria-hidden
    >
      {/* speaker body — solid block */}
      <rect x="1" y="6" width="3" height="4" fill="currentColor" />
      {/* cone — triangle widening to the right */}
      <rect x="4" y="5" width="1" height="6" fill="currentColor" />
      <rect x="5" y="4" width="1" height="8" fill="currentColor" />
      <rect x="6" y="3" width="1" height="10" fill="currentColor" />
      <rect x="7" y="2" width="1" height="12" fill="currentColor" />
      {muted ? (
        <>
          {/* bold red X (2-px strokes) on the right of the speaker */}
          <rect x="9" y="3" width="2" height="2" fill="#d62a18" />
          <rect x="13" y="3" width="2" height="2" fill="#d62a18" />
          <rect x="10" y="5" width="2" height="2" fill="#d62a18" />
          <rect x="12" y="5" width="2" height="2" fill="#d62a18" />
          <rect x="11" y="7" width="2" height="2" fill="#d62a18" />
          <rect x="10" y="9" width="2" height="2" fill="#d62a18" />
          <rect x="12" y="9" width="2" height="2" fill="#d62a18" />
          <rect x="9" y="11" width="2" height="2" fill="#d62a18" />
          <rect x="13" y="11" width="2" height="2" fill="#d62a18" />
        </>
      ) : (
        <>
          {/* three concentric C-shaped sound waves */}
          {/* close wave */}
          <rect x="9" y="6" width="1" height="1" fill="currentColor" />
          <rect x="10" y="7" width="1" height="2" fill="currentColor" />
          <rect x="9" y="9" width="1" height="1" fill="currentColor" />
          {/* middle wave */}
          <rect x="11" y="5" width="1" height="1" fill="currentColor" />
          <rect x="12" y="6" width="1" height="4" fill="currentColor" />
          <rect x="11" y="10" width="1" height="1" fill="currentColor" />
          {/* far wave */}
          <rect x="13" y="4" width="1" height="1" fill="currentColor" />
          <rect x="14" y="5" width="1" height="6" fill="currentColor" />
          <rect x="13" y="11" width="1" height="1" fill="currentColor" />
        </>
      )}
    </svg>
  </button>
);

export const PixelFullscreenButton = ({
  active,
  onToggle,
  size = 40,
}: {
  active: boolean;
  onToggle: () => void;
  size?: number;
}) => (
  <button
    onClick={onToggle}
    aria-label={active ? "Exit fullscreen" : "Enter fullscreen"}
    title={active ? "Exit fullscreen" : "Enter fullscreen"}
    className="flex items-center justify-center rounded-[6px] border-2 border-gray-300 bg-white text-gray-700 outline outline-2 outline-gray-600 transition-colors hover:bg-zinc-100"
    style={{ width: size, height: size }}
  >
    <svg
      width={Math.round(size * 0.55)}
      height={Math.round(size * 0.55)}
      viewBox="0 0 16 16"
      style={{ imageRendering: "pixelated", shapeRendering: "crispEdges" }}
      aria-hidden
    >
      {active ? (
        <>
          {/* Inward-pointing corners (collapse). */}
          <rect x="2" y="5" width="3" height="1" fill="currentColor" />
          <rect x="4" y="3" width="1" height="3" fill="currentColor" />
          <rect x="11" y="5" width="3" height="1" fill="currentColor" />
          <rect x="11" y="3" width="1" height="3" fill="currentColor" />
          <rect x="2" y="10" width="3" height="1" fill="currentColor" />
          <rect x="4" y="10" width="1" height="3" fill="currentColor" />
          <rect x="11" y="10" width="3" height="1" fill="currentColor" />
          <rect x="11" y="10" width="1" height="3" fill="currentColor" />
        </>
      ) : (
        <>
          {/* Outward-pointing corners (expand). */}
          <rect x="2" y="2" width="4" height="1" fill="currentColor" />
          <rect x="2" y="2" width="1" height="4" fill="currentColor" />
          <rect x="10" y="2" width="4" height="1" fill="currentColor" />
          <rect x="13" y="2" width="1" height="4" fill="currentColor" />
          <rect x="2" y="13" width="4" height="1" fill="currentColor" />
          <rect x="2" y="10" width="1" height="4" fill="currentColor" />
          <rect x="10" y="13" width="4" height="1" fill="currentColor" />
          <rect x="13" y="10" width="1" height="4" fill="currentColor" />
        </>
      )}
    </svg>
  </button>
);

export function useFullscreen(targetRef: React.RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => setActive(document.fullscreenElement === targetRef.current);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [targetRef]);
  const toggle = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      // silent-ok: exit-fullscreen rejection is non-actionable; the game still renders windowed
      document.exitFullscreen?.().catch(() => undefined);
    } else {
      // silent-ok: fullscreen request denied by the user or unsupported; the game still renders windowed
      targetRef.current?.requestFullscreen?.().catch(() => undefined);
    }
  }, [targetRef]);
  return [active, toggle] as const;
}

export const CoinSpinner = ({ size = 28 }: { size?: number }) => (
  <LoopingFrames
    count={COIN_FRAMES}
    size={size}
    interval={90}
    render={(f) => <CoinFrame frame={f} cssSize="100%" />}
  />
);

export const InstructionsBtns = ({ onOpen }: { onOpen: () => void }) => (
  <button
    onClick={onOpen}
    aria-label="How to play"
    title="How to play"
    className="flex h-11 items-center gap-2 rounded-[6px] border-2 border-gray-300 bg-white px-3 outline outline-2 outline-gray-600 hover:bg-zinc-200"
  >
    <VoltorbIcon size={28} />
    <span className="drop-shadow-soft text-base leading-none font-bold text-gray-600">
      How to play
    </span>
  </button>
);
