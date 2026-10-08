// Tower Stacker engine. PURE, seedable and DOM-free: the renderer calls it with
// timestamps and the server check imports its constants (via scoring.ts), so do not
// import React, the DOM or storage here. engine.test.ts runs in the node environment.
import { mulberry32, subSeed } from "../password-game-2/engine/rng";
import { LAND_POINTS, perfectPoints } from "./scoring";

export const WORLD_WIDTH = 600;
export const BASE_WIDTH = 240;
export const BLOCK_HEIGHT = 40;
/** The hanging block rides this many floors above the top slab. */
export const HANG_GAP = 3;
/** The crane sweeps the block's left edge this far either side of the top slab's. */
export const CRANE_REACH = 210;
/** A landing within this many units of the top slab is perfect. */
export const PERFECT_TOLERANCE = 8;
/** An overlap thinner than this is a miss. */
export const MIN_OVERLAP = 4;
export const GROW_EVERY = 3;
export const GROW_AMOUNT = 12;
export const FALL_MS = 260;
export const SETTLE_MS = 140;
/** Minimum time from one drop to the next block: the server's blocks-per-second ceiling. */
export const CYCLE_MS = FALL_MS + SETTLE_MS;
export const SPEED_BASE = 0.3;
export const SPEED_STEP = 0.025;
export const SPEED_EVERY = 5;
export const SPEED_MAX = 0.6;
export const SPEED_JITTER = 0.08;
export const PALETTE_SIZE = 6;

export interface Slab {
  left: number;
  width: number;
}

export interface Swing {
  /** Units per millisecond. */
  speed: number;
  dir: 1 | -1;
  /** Start position in the sweep, 0..0.15 of a cycle (near an edge). */
  phase: number;
  /** Palette index for the renderer. */
  tone: number;
  spawnAt: number;
}

export type DropOutcome =
  | { kind: "perfect"; slab: Slab; streak: number; grew: boolean; points: number }
  | { kind: "trim"; slab: Slab; cut: Slab; points: number }
  | { kind: "miss"; piece: Slab };

export interface TowerRun {
  seed: number;
  /** slabs[0] is the foundation; every later slab is a landed floor. */
  slabs: Slab[];
  /** The hanging block, or null once the run is over. */
  swing: Swing | null;
  score: number;
  streak: number;
  bestStreak: number;
  perfects: number;
  over: boolean;
  startedAt: number;
  endedAt: number | null;
  pausedAt: number | null;
  pausedMs: number;
}

export function baseSpeed(height: number): number {
  return Math.min(SPEED_MAX, SPEED_BASE + SPEED_STEP * Math.floor(height / SPEED_EVERY));
}

/** The hanging block's parameters for block `index` (1-based) at tower `height`. */
export function swingFor(seed: number, index: number, height: number, spawnAt: number): Swing {
  const rng = mulberry32(subSeed(seed, `block-${index}`));
  const jitter = 1 - SPEED_JITTER + 2 * SPEED_JITTER * rng();
  const dir = rng() < 0.5 ? 1 : -1;
  const phase = 0.15 * rng();
  const tone = Math.floor(rng() * PALETTE_SIZE);
  return { speed: baseSpeed(height) * jitter, dir, phase, tone, spawnAt };
}

/** Where the block's left edge sits relative to the top slab's, `now` ms after spawn. */
export function craneOffset(swing: Swing, now: number): number {
  const t = Math.max(0, now - swing.spawnAt);
  const u = (((swing.phase + (t * swing.speed) / (4 * CRANE_REACH)) % 1) + 1) % 1;
  const s =
    u < 0.5 ? -CRANE_REACH + 4 * CRANE_REACH * u : CRANE_REACH - 4 * CRANE_REACH * (u - 0.5);
  return swing.dir * s;
}

export function topSlab(run: TowerRun): Slab {
  const top = run.slabs[run.slabs.length - 1];
  if (!top) throw new Error("tower has no foundation");
  return top;
}

export function newRun(seed: number, now: number): TowerRun {
  return {
    seed,
    slabs: [{ left: -BASE_WIDTH / 2, width: BASE_WIDTH }],
    swing: swingFor(seed, 1, 0, now),
    score: 0,
    streak: 0,
    bestStreak: 0,
    perfects: 0,
    over: false,
    startedAt: now,
    endedAt: null,
    pausedAt: null,
    pausedMs: 0,
  };
}

/**
 * Release the hanging block at `now`. Null when the run is over or paused, or the
 * block has not spawned yet. Never mutates `run`.
 */
export function drop(run: TowerRun, now: number): { run: TowerRun; outcome: DropOutcome } | null {
  const swing = run.swing;
  if (run.over || run.pausedAt !== null || !swing || now < swing.spawnAt) return null;

  const top = topSlab(run);
  const offset = Math.round(craneOffset(swing, now));
  const left = top.left + offset;
  const overlap = top.width - Math.abs(offset);

  if (overlap < MIN_OVERLAP) {
    return {
      run: { ...run, swing: null, over: true, streak: 0, endedAt: now },
      outcome: { kind: "miss", piece: { left, width: top.width } },
    };
  }

  let slab: Slab;
  let outcome: DropOutcome;
  let streak = 0;
  let perfects = run.perfects;
  let points: number;
  if (Math.abs(offset) <= PERFECT_TOLERANCE) {
    streak = run.streak + 1;
    perfects += 1;
    points = perfectPoints(streak);
    slab = { left: top.left, width: top.width };
    const grow = streak % GROW_EVERY === 0 ? Math.min(GROW_AMOUNT, BASE_WIDTH - top.width) : 0;
    if (grow > 0) slab = { left: top.left - grow / 2, width: top.width + grow };
    outcome = { kind: "perfect", slab, streak, grew: grow > 0, points };
  } else {
    points = LAND_POINTS;
    slab = { left: Math.max(left, top.left), width: overlap };
    // The overhang is the part of the block that sticks out past the top slab.
    const cut: Slab =
      offset > 0 ? { left: top.left + top.width, width: offset } : { left, width: -offset };
    outcome = { kind: "trim", slab, cut, points };
  }

  const slabs = [...run.slabs, slab];
  const next: TowerRun = {
    ...run,
    slabs,
    swing: swingFor(run.seed, slabs.length, slabs.length - 1, now + CYCLE_MS),
    score: run.score + points,
    streak,
    bestStreak: Math.max(run.bestStreak, streak),
    perfects,
  };
  return { run: next, outcome };
}

export function pauseRun(run: TowerRun, now: number): TowerRun {
  if (run.over || run.pausedAt !== null) return run;
  return { ...run, pausedAt: now };
}

export function resumeRun(run: TowerRun, now: number): TowerRun {
  if (run.pausedAt === null) return run;
  const gap = Math.max(0, now - run.pausedAt);
  return {
    ...run,
    pausedAt: null,
    pausedMs: run.pausedMs + gap,
    swing: run.swing ? { ...run.swing, spawnAt: run.swing.spawnAt + gap } : null,
  };
}

/** Whole seconds of active play (pauses excluded), up to the end or `now`. */
export function runSeconds(run: TowerRun, now: number): number {
  const end = run.endedAt ?? run.pausedAt ?? now;
  return Math.max(0, Math.floor((end - run.startedAt - run.pausedMs) / 1000));
}

/** The first instant at or after `from` when a release lands perfectly centred (offset 0). */
export function perfectDropTime(run: TowerRun, from: number): number {
  const swing = run.swing;
  if (!swing) throw new Error("run is over");
  const start = Math.max(from, swing.spawnAt);
  const period = (4 * CRANE_REACH) / swing.speed;
  for (let t = start; t <= start + period; t++) {
    if (Math.round(craneOffset(swing, t)) === 0) return t;
  }
  throw new Error("no centred instant in one sweep");
}

/**
 * The most floors `seconds` of active play can land, plus slack. The server check
 * imports it as the blocks-per-second ceiling.
 */
export function maxBlocksFor(seconds: number): number {
  return Math.floor(((seconds + 1) * 1000) / CYCLE_MS) + 2;
}
