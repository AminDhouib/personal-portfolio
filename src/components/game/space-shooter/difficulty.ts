import type { GameRefs, ObstacleVariant } from "./types";

export function difficulty(g: GameRefs): number {
  const t = (performance.now() - g.startedAt) / 1000;
  const ramp = 0.25 + Math.sqrt(t) * 0.22;
  const base = Math.min(ramp, 3.0);
  return g.isMobile ? base * 0.88 : base;
}

export function elapsedSeconds(g: GameRefs): number {
  return (performance.now() - g.startedAt) / 1000;
}

export function comboMultiplier(combo: number): number {
  if (combo < 3) return 1;
  if (combo < 5) return 1.5;
  if (combo < 10) return 2;
  if (combo < 20) return 3;
  if (combo < 40) return 5;
  return 10;
}

export function comboColor(combo: number): string {
  if (combo >= 40) return "#f472b6";
  if (combo >= 20) return "#fb923c";
  if (combo >= 10) return "#facc15";
  if (combo >= 5) return "#22d3ee";
  return "#a3e635";
}

export function unlockedVariants(seconds: number): ObstacleVariant[] {
  const list: ObstacleVariant[] = ["basic"];
  if (seconds > 25) list.push("heavy");
  if (seconds > 50) list.push("speeder");
  if (seconds > 90) list.push("shooter");
  if (seconds > 130) list.push("zapper");
  if (seconds > 170) list.push("drone");
  return list;
}
