import type { Point } from "./types";

// ═══════════════════════════════════════════════════════════════
// MATH HELPERS
// ═══════════════════════════════════════════════════════════════

export function rotatePoint(x: number, y: number, theta: number): Point {
  const r = (theta * Math.PI) / 180;
  return {
    x: Math.cos(r) * x - Math.sin(r) * y,
    y: Math.sin(r) * x + Math.cos(r) * y,
  };
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * max + min);
}
