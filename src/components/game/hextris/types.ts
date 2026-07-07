// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface Point {
  x: number;
  y: number;
}

export type SpecialKind = "bomb" | "rainbow" | null;

export interface Block {
  settled: number;
  height: number;
  fallingLane: number;
  checked: number;
  angle: number;
  angularVelocity: number;
  targetAngle: number;
  color: string;
  deleted: number;
  removed: number;
  tint: number;
  opacity: number;
  initializing: number;
  ict: number;
  iter: number;
  initLen: number;
  attachedLane: number;
  distFromHex: number;
  width: number;
  widthWide: number;
  special: SpecialKind;
}

export interface TextObj {
  x: number;
  y: number;
  text: string;
  color: string;
  opacity: number;
  alive: number;
}

export interface Shake {
  lane: number;
  magnitude: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0..1 remaining
  size: number;
  color: string;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

// Portfolio accent palette — matches --color-accent-* in globals.css
export const COLORS = ["#ec4899", "#f59e0b", "#6366f1", "#22c55e"] as const; // pink, amber, blue, green
export const TINTED: Record<string, string> = {
  "#ec4899": "rgba(236,72,153,0.35)",
  "#f59e0b": "rgba(245,158,11,0.35)",
  "#6366f1": "rgba(99,102,241,0.35)",
  "#22c55e": "rgba(34,197,94,0.35)",
};
// Glow rgba values for block shadows
export const GLOW: Record<string, string> = {
  "#ec4899": "rgba(236,72,153,0.55)",
  "#f59e0b": "rgba(245,158,11,0.55)",
  "#6366f1": "rgba(99,102,241,0.55)",
  "#22c55e": "rgba(34,197,94,0.55)",
};

// Theme colors (dark)
export const THEME = {
  bg: "#0d0d0d", // canvas / game board
  bgOuter: "#050505", // beyond the hex boundary
  hexFill: [17, 17, 20] as [number, number, number], // center hex
  hexStroke: "rgba(255,255,255,0.08)", // center hex outline
  outerBoundary: "rgba(255,255,255,0.07)", // outer hexagon fill
  gridLine: "rgba(255,255,255,0.03)",
  text: "#ededed",
  muted: "#888888",
  heading: "#ededed",
};

export const AV_CONST = 4;
