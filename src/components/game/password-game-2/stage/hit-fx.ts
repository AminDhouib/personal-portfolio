import { mulberry32 } from "../engine/rng";
import type { GameState, PointerTarget, PointerTargetKind } from "../engine/types";

/*
 * Hit feedback for the canvas targets (aliens, parasites, finale missiles): a particle
 * burst where the hit landed, a short hit-stop that freezes the painters' clock (never
 * the engine tick), and a panel shake sized to the hit. Pure and seeded, so a burst is
 * the same every time and tests can pin it.
 */

export interface Particle {
  x: number;
  y: number;
  /** Velocity in CSS px per ms. */
  vx: number;
  vy: number;
  ageMs: number;
  lifeMs: number;
  /** 1 at spawn, 0 at the end of life. */
  alpha: number;
}

/** How long the painters hold still when a hit lands. */
export const HIT_STOP_MS = 60;

const LIFE_MIN_MS = 320;
const LIFE_SPREAD_MS = 260;
const SPEED_MIN = 0.12;
const SPEED_SPREAD = 0.22;
/** Downward pull, px per ms squared: the sparks arc instead of drifting forever. */
const GRAVITY = 0.0006;

/** N particles flung out of (x, y) in a seeded spray. */
export function burstAt(x: number, y: number, n: number, seed: number): Particle[] {
  const rng = mulberry32(seed);
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const angle = ((i + rng() * 0.8) / n) * Math.PI * 2;
    const speed = SPEED_MIN + rng() * SPEED_SPREAD;
    out.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ageMs: 0,
      lifeMs: LIFE_MIN_MS + rng() * LIFE_SPREAD_MS,
      alpha: 1,
    });
  }
  return out;
}

/** Advance every particle by dtMs; drop the ones past their life. */
export function stepParticles(ps: readonly Particle[], dtMs: number): Particle[] {
  const out: Particle[] = [];
  for (const p of ps) {
    const ageMs = p.ageMs + dtMs;
    if (ageMs >= p.lifeMs) continue;
    const vy = p.vy + GRAVITY * dtMs;
    out.push({
      ...p,
      x: p.x + p.vx * dtMs,
      y: p.y + vy * dtMs,
      vy,
      ageMs,
      alpha: 1 - ageMs / p.lifeMs,
    });
  }
  return out;
}

export type HitKind = "parasite-evict" | "alien-hit" | "missile-intercept";

/** Shake in CSS px, by weight: a flicked parasite twitches, a caught missile jolts. */
const SHAKE_PX: Record<HitKind, number> = {
  "parasite-evict": 3,
  "alien-hit": 5,
  "missile-intercept": 9,
};
const SHAKE_CAP_PX = 14;

export function shakeFor(kind: HitKind): number {
  return Math.min(SHAKE_CAP_PX, SHAKE_PX[kind]);
}

/** Particles per burst, and the family colour they glow in. */
export const BURST: Record<HitKind, { n: number; color: string }> = {
  "parasite-evict": { n: 10, color: "#a78bfa" },
  "alien-hit": { n: 14, color: "#f87171" },
  "missile-intercept": { n: 18, color: "#4ade80" },
};

/** The canvas targets that give hit feedback; anything else (a cell, a chip) gives none. */
const HIT_KIND: Partial<Record<PointerTargetKind, HitKind>> = {
  alien: "alien-hit",
  parasite: "parasite-evict",
  missile: "missile-intercept",
};

export function hitKindFor(target: PointerTarget): HitKind | null {
  return HIT_KIND[target.kind] ?? null;
}

export interface HitSnapshot {
  version: number;
  aliensDowned: number;
  missilesIntercepted: number;
}

/** What a landed hit changes: the cell run (version) or one of the hit counters. */
export function hitSnapshot(g: GameState): HitSnapshot {
  return {
    version: g.version,
    aliensDowned: g.stats.aliensDowned,
    missilesIntercepted: g.stats.missilesIntercepted,
  };
}

/** True when the pointer press between the snapshot and now actually hit something. */
export function hitLanded(before: HitSnapshot, g: GameState): boolean {
  return (
    g.version !== before.version ||
    g.stats.aliensDowned !== before.aliensDowned ||
    g.stats.missilesIntercepted !== before.missilesIntercepted
  );
}

/**
 * The painters' clock. It runs on real frame time, but stands still for HIT_STOP_MS after
 * a hit, so the art and the sparks hold for a beat. The engine's clock never stops.
 */
export interface PaintClock {
  lastMs: number | null;
  paintMs: number;
  stopUntilMs: number;
  stopPending: boolean;
}

export function newPaintClock(): PaintClock {
  return { lastMs: null, paintMs: 0, stopUntilMs: -Infinity, stopPending: false };
}

/** Ask for a hit-stop; it starts on the next frame. */
export function requestHitStop(c: PaintClock): void {
  c.stopPending = true;
}

/**
 * Advance the clock to the frame at real time tMs. Returns the frame's step for the
 * particles: 0 while the hit-stop holds, the real (clamped) frame time otherwise.
 */
export function stepPaintClock(c: PaintClock, tMs: number): number {
  if (c.lastMs === null) {
    c.lastMs = tMs;
    c.paintMs = tMs;
    return 0;
  }
  const dt = Math.max(0, Math.min(100, tMs - c.lastMs));
  c.lastMs = tMs;
  if (c.stopPending) {
    c.stopPending = false;
    c.stopUntilMs = tMs + HIT_STOP_MS;
  }
  if (tMs < c.stopUntilMs) return 0;
  c.paintMs += dt;
  return dt;
}
