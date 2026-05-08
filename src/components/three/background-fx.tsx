"use client";

import { useEffect, useRef } from "react";

/**
 * Stacked low-cost ambient effects, all `pointer-events: none` so they
 * never intercept input. Layer order (bottom → top):
 *   1. Aurora    — slow CSS linear-gradient drift
 *   2. Vignette  — radial gradient darkening the corners
 *   3. Glow      — single radial blob lerping toward the cursor (RAF)
 *   4. Grain     — SVG-noise PNG tile at low opacity
 *
 * The 3D wireframes sit underneath in their own canvas. These are CSS
 * only with one RAF for the pointer glow — should add < 0.5ms / frame.
 */
export function BackgroundFX() {
  const glowRef = useRef<HTMLDivElement | null>(null);
  // Lerp-target + current tracked positions for the cursor-follow blob.
  const target = useRef({ x: 0.5, y: 0.5 });
  const current = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    target.current = { x: 0.5, y: 0.4 };
    current.current = { x: 0.5, y: 0.4 };

    const onMove = (e: PointerEvent) => {
      target.current.x = e.clientX / window.innerWidth;
      target.current.y = e.clientY / window.innerHeight;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    const tick = () => {
      // Eased lerp toward the cursor — keeps the glow lazy and elegant.
      current.current.x += (target.current.x - current.current.x) * 0.06;
      current.current.y += (target.current.y - current.current.y) * 0.06;
      const el = glowRef.current;
      if (el) {
        el.style.setProperty("--gx", `${current.current.x * 100}%`);
        el.style.setProperty("--gy", `${current.current.y * 100}%`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      {/* 1. Aurora — slow color drift behind everything else. */}
      <div className="bg-fx-aurora" aria-hidden />
      {/* 2. Edge vignette — pulls focus to the center column. */}
      <div className="bg-fx-vignette" aria-hidden />
      {/* 3. Pointer-tracking soft glow. */}
      <div ref={glowRef} className="bg-fx-glow" aria-hidden />
      {/* 4. Film grain — last so it sits on top of all of the above. */}
      <div className="bg-fx-grain" aria-hidden />
    </>
  );
}
