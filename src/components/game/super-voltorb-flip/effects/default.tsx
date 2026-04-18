"use client";
import { useEffect, useState } from "react";
import type { EffectProps, EffectTheme } from ".";

const EXPLODE_FRAMES = Array.from(
  { length: 9 },
  (_, i) => `/games/super-voltorb-flip/sprites/upstream/tile/explode_${i}.png`,
);

function ExplosionSprite({ onDone }: EffectProps) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (frame === EXPLODE_FRAMES.length - 1) {
      const t = setTimeout(onDone, 80);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setFrame((f) => f + 1), 60);
    return () => clearTimeout(t);
  }, [frame, onDone]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={EXPLODE_FRAMES[frame]}
      width={40}
      height={40}
      alt=""
      style={{ imageRendering: "pixelated", pointerEvents: "none" }}
    />
  );
}

const SUCCESS_FRAMES = Array.from(
  { length: 4 },
  (_, i) => `/games/super-voltorb-flip/sprites/upstream/success_${i}.png`,
);

function SparkleSprite({ onDone }: EffectProps) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (frame === SUCCESS_FRAMES.length - 1) {
      const t = setTimeout(onDone, 100);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setFrame((f) => f + 1), 80);
    return () => clearTimeout(t);
  }, [frame, onDone]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SUCCESS_FRAMES[frame]}
      width={40}
      height={40}
      alt=""
      style={{ imageRendering: "pixelated", pointerEvents: "none" }}
    />
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
