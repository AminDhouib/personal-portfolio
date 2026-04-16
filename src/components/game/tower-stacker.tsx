"use client";

import { useEffect, useRef, useState } from "react";

export default function TowerStacker() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#b91c1c";
    ctx.font = "24px sans-serif";
    ctx.fillText("Tower Stacker — scaffolded", 20, 40);
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-card">
      <canvas
        ref={canvasRef}
        width={800}
        height={420}
        className="block w-full h-[420px] touch-none"
        style={{ touchAction: "manipulation" }}
      />
    </div>
  );
}
