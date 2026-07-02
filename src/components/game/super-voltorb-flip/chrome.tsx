"use client";

import React, { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Inline SVG voltorb — substitutes upstream's `voltorb.png` / `voltorb-flip.png`
// (Nintendo IP we can't redistribute). Red-top, white-bottom face ball.
// ---------------------------------------------------------------------------

// Upstream sprite (28x28 PNG, mirrored into /public from jv-vogler/voltorb-flip).
export function VoltorbIcon({
  size = 28,
  cssSize,
  className,
}: {
  size?: number;
  cssSize?: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/games/super-voltorb-flip/sprites/upstream/voltorb.png"
      width={cssSize ? undefined : size}
      height={cssSize ? undefined : size}
      alt=""
      aria-hidden="true"
      className={className}
      style={{
        display: "block",
        imageRendering: "pixelated",
        width: cssSize,
        height: cssSize,
      }}
    />
  );
}

const EXPLODE_FRAME_URLS = Array.from(
  { length: 9 },
  (_, i) => `/games/super-voltorb-flip/sprites/upstream/tile/explode_${i}.png`,
);
const SUCCESS_FRAME_URLS = Array.from(
  { length: 4 },
  (_, i) => `/games/super-voltorb-flip/sprites/upstream/success_${i}.png`,
);

function LoopingFrames({
  frames,
  size,
  interval = 90,
  pauseMs = 0,
}: {
  frames: string[];
  size: number;
  interval?: number;
  pauseMs?: number;
}) {
  const [frame, setFrame] = useState(0);
  // Scheduling the next tick inside the setFrame updater fires twice in
  // React Strict Mode (the updater runs twice for purity-checking), which
  // doubles up the timers and makes the loop run far faster than `interval`.
  // Keep the side effect in useEffect, keyed on `frame`.
  useEffect(() => {
    const delay = frame === 0 && pauseMs > 0 ? pauseMs : interval;
    const t = window.setTimeout(() => {
      setFrame((f) => (f + 1) % frames.length);
    }, delay);
    return () => window.clearTimeout(t);
  }, [frame, frames.length, interval, pauseMs]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={frames[frame]}
      width={size}
      height={size}
      alt=""
      style={{ imageRendering: "pixelated", pointerEvents: "none" }}
    />
  );
}

export const LoopingExplosion = ({ size }: { size: number }) => (
  <LoopingFrames frames={EXPLODE_FRAME_URLS} size={size} interval={70} pauseMs={500} />
);

export const LoopingSparkle = ({ size }: { size: number }) => (
  <LoopingFrames frames={SUCCESS_FRAME_URLS} size={size} interval={110} pauseMs={700} />
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
    className="flex items-center justify-center rounded-[6px] border-2 border-gray-300 bg-white outline outline-2 outline-gray-600 text-gray-700 transition-colors hover:bg-zinc-100"
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
    className="flex items-center justify-center rounded-[6px] border-2 border-gray-300 bg-white outline outline-2 outline-gray-600 text-gray-700 transition-colors hover:bg-zinc-100"
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
    const handler = () =>
      setActive(document.fullscreenElement === targetRef.current);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [targetRef]);
  const toggle = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      targetRef.current?.requestFullscreen?.();
    }
  }, [targetRef]);
  return [active, toggle] as const;
}

const COIN_FRAME_URLS = Array.from(
  { length: 12 },
  (_, i) => `/games/super-voltorb-flip/sprites/upstream/coin/coin_${i}.png`,
);

export const CoinSpinner = ({ size = 28 }: { size?: number }) => (
  <LoopingFrames frames={COIN_FRAME_URLS} size={size} interval={90} />
);

export const PokeballIcon = ({ size = 22 }: { size?: number }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src="/games/super-voltorb-flip/sprites/upstream/pokeball.png"
    width={size}
    height={size}
    alt=""
    aria-hidden
    style={{ imageRendering: "pixelated", display: "block" }}
  />
);

export const InstructionsBtns = ({ onOpen }: { onOpen: () => void }) => (
  <button
    onClick={onOpen}
    aria-label="How to play"
    title="How to play"
    className="flex h-11 items-center gap-2 rounded-[6px] border-2 border-gray-300 bg-white px-3 outline outline-2 outline-gray-600 hover:bg-zinc-200"
  >
    <PokeballIcon size={32} />
    <span className="text-base leading-none font-bold text-gray-600 drop-shadow-soft">
      How to play
    </span>
  </button>
);
