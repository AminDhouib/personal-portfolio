"use client";
import { useEffect, useState, type CSSProperties } from "react";
import type { EffectProps, EffectTheme } from ".";
import { SparkleFrame } from "../art/frames";
import { BURST_FRAMES, SPARKLE_FRAMES } from "../art/fx";
import { EXPLODE_FRAME_SRCS, explodeFrameCssSize } from "../art/original-sprites";

// Both overlays sit centred over the revealed tile and overflow its edges. The
// Voltorb stays visible underneath (the tile's own face); the burst frames carry
// the same Voltorb in their middle, at the same scale.
const overlayBox = (scale: number): CSSProperties => ({
  position: "absolute",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  width: `calc(var(--svf-tile) * ${scale})`,
  height: `calc(var(--svf-tile) * ${scale})`,
  pointerEvents: "none",
});

function ExplosionSprite({ onDone }: EffectProps) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (frame === BURST_FRAMES - 1) {
      const t = setTimeout(onDone, 80);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setFrame((f) => f + 1), 60);
    return () => clearTimeout(t);
  }, [frame, onDone]);
  // The original frames grow from the tile's size to well past the cell, so the blast radius
  // extends past it; each frame is sized from its native pixels (explodeFrameCssSize).
  return (
    // eslint-disable-next-line @next/next/no-img-element -- original pixel-art frames, scaled with CSS and never optimized
    <img
      src={EXPLODE_FRAME_SRCS[frame]}
      alt=""
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: explodeFrameCssSize(frame),
        height: explodeFrameCssSize(frame),
        maxWidth: "none",
        maxHeight: "none",
        imageRendering: "pixelated",
        pointerEvents: "none",
      }}
    />
  );
}

function SparkleSprite({ onDone }: EffectProps) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (frame === SPARKLE_FRAMES - 1) {
      const t = setTimeout(onDone, 100);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setFrame((f) => f + 1), 80);
    return () => clearTimeout(t);
  }, [frame, onDone]);
  // Slightly larger than the tile so the sparkle rays poke past edges.
  return (
    <div style={overlayBox(1.4)}>
      <SparkleFrame frame={frame} cssSize="100%" />
    </div>
  );
}

function WinOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-4xl font-black text-yellow-300">
      Level Cleared!
    </div>
  );
}

export const theme: EffectTheme = {
  name: "default",
  BombFlip: ExplosionSprite,
  CoinReveal: SparkleSprite,
  Win: WinOverlay,
};
