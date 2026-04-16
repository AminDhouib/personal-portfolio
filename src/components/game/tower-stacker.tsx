"use client";

import { useEffect, useRef, useState } from "react";

interface ViewportSize {
  w: number;
  h: number;
  dpr: number;
}

export default function TowerStacker() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<ViewportSize>({ w: 800, h: 600, dpr: 1 });
  const [, forceTick] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const applySize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(420, Math.min(720, Math.floor(rect.width * 0.9)));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      viewportRef.current = { w, h, dpr };
      forceTick((n) => (n + 1) % 1_000_000);
    };

    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(container);
    window.addEventListener("orientationchange", applySize);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", applySize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = viewportRef.current;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(1, "#1f2937");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ef4444";
    ctx.font = "600 28px system-ui, sans-serif";
    ctx.fillText("Tower Stacker", 24, 48);
  });

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border border-border bg-card"
    >
      <canvas
        ref={canvasRef}
        className="block w-full touch-none select-none"
        style={{ touchAction: "manipulation" }}
      />
    </div>
  );
}
