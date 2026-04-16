"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tower Stacker — embedded port of iamkun/tower_game (MIT License).
 *
 * This component hosts the upstream game in an <iframe> pointed at
 * /tower_stacker/game.html, which loads the game's original assets and
 * prebuilt bundle from /public/tower_stacker/{assets,dist}. See
 * /public/tower_stacker/LICENSE for the original MIT copyright.
 *
 * Original project: https://github.com/iamkun/tower_game
 */
export default function TowerStacker(_props: { initialSeed?: string } = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number }>({
    w: 360,
    h: 600,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => {
      const rect = el.getBoundingClientRect();
      // The upstream game uses a 3:2 portrait ratio (height / width >= 1.5).
      // Cap height to a pleasant desktop viewport; scale down on mobile.
      const maxWidth = Math.min(440, Math.floor(rect.width));
      const w = Math.max(280, maxWidth);
      const h = Math.min(720, Math.round(w * 1.5));
      setFrameSize({ w, h });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full flex items-center justify-center rounded-xl overflow-hidden border border-accent-red/30 bg-card"
      style={{
        minHeight: 480,
        boxShadow: "0 0 80px -20px rgba(239, 68, 68, 0.35), inset 0 0 0 1px rgba(239, 68, 68, 0.08)",
      }}
    >
      <iframe
        key={`${frameSize.w}x${frameSize.h}`}
        src="/tower_stacker/game.html"
        title="Tower Stacker"
        width={frameSize.w}
        height={frameSize.h}
        scrolling="no"
        className="block border-0"
        style={{ background: "#0a0a0a" }}
        // Sandbox lets the game run JS + audio, but stays isolated from the host.
        sandbox="allow-scripts allow-same-origin"
        allow="autoplay"
      />
    </div>
  );
}
