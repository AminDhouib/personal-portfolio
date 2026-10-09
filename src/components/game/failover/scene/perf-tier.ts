import type { GfxPref } from "../prefs";

// Two graphics tiers and the rules that pick between them. Pure: the device
// facts arrive as a plain object (readPerfEnv gathers them in the browser), so
// the rules are tested without a browser.

export type PerfTier = "high" | "low";

export interface PerfEnv {
  /** The primary pointer is a finger (`(pointer: coarse)`). */
  coarsePointer: boolean;
  /** navigator.deviceMemory in GB, where the browser reports it. */
  deviceMemory?: number;
  /** navigator.hardwareConcurrency, where the browser reports it. */
  hardwareConcurrency?: number;
}

export interface TierSettings {
  /** Ceiling on the renderer's device pixel ratio. */
  maxPixelRatio: number;
  antialias: boolean;
  /** Requests drawn at once; the sim still runs every one. */
  maxDrawnRequests: number;
  /** Minimum time between renders in ms (0: every animation frame). */
  frameIntervalMs: number;
  /** Nodes bob gently while nothing happens. */
  idleAnimation: boolean;
}

export const TIER_SETTINGS: Record<PerfTier, TierSettings> = {
  high: {
    maxPixelRatio: 2,
    antialias: true,
    maxDrawnRequests: 600,
    frameIntervalMs: 0,
    idleAnimation: true,
  },
  low: {
    maxPixelRatio: 1,
    antialias: false,
    maxDrawnRequests: 150,
    frameIntervalMs: 1000 / 30,
    idleAnimation: false,
  },
};

/** The tier a session starts on. A stored High or Low wins over the device. */
export function initialTier(env: PerfEnv, pref: GfxPref): PerfTier {
  if (pref !== "auto") return pref;
  if (!env.coarsePointer) return "high";
  const lowMemory = env.deviceMemory !== undefined && env.deviceMemory <= 4;
  const fewCores = env.hardwareConcurrency !== undefined && env.hardwareConcurrency <= 4;
  return lowMemory || fewCores ? "low" : "high";
}

/** Frames per judgement window. */
export const GOVERNOR_FRAMES = 60;
/** A window averaging more than this (ms per frame) drops an Auto session to low. */
const SLOW_FRAME_MS = 24;

export interface Governor {
  tier: PerfTier;
  pref: GfxPref;
  frames: number;
  totalMs: number;
}

export function createGovernor(tier: PerfTier, pref: GfxPref): Governor {
  return { tier, pref, frames: 0, totalMs: 0 };
}

/**
 * Count one rendered frame. On Auto, a full window that averages over 24 ms
 * drops the session to low; nothing ever raises it again, so the scene cannot
 * flap between tiers. A stored choice is never second-guessed.
 */
export function recordFrame(g: Governor, frameMs: number): Governor {
  if (g.pref !== "auto" || g.tier === "low") return g;
  const frames = g.frames + 1;
  const totalMs = g.totalMs + frameMs;
  if (frames < GOVERNOR_FRAMES) return { ...g, frames, totalMs };
  const tier: PerfTier = totalMs / frames > SLOW_FRAME_MS ? "low" : "high";
  return { ...g, tier, frames: 0, totalMs: 0 };
}

/** The device facts initialTier needs, read from this browser. */
export function readPerfEnv(): PerfEnv {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    coarsePointer:
      typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches,
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : undefined,
  };
}
