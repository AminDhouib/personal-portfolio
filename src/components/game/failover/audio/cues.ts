import type { SimEvent } from "../sim/types";

// Failover's synthesized cues: tables of notes and noise hits that synth.ts turns
// into Web Audio nodes. Our own set, one cue per moment the game marks; no sample
// files. Times are milliseconds from the start of the cue; `ms` is its nominal
// length. (The types are a copy of Script Knight's: games do not import each other.)

export type Wave = "sine" | "square" | "triangle" | "sawtooth";

export interface Note {
  at: number;
  dur: number;
  hz: number;
  /** When set, the pitch glides exponentially from `hz` to `toHz` over the note. */
  toHz?: number;
  wave: Wave;
  gain: number;
}

export interface NoiseHit {
  at: number;
  dur: number;
  gain: number;
  filter: "lowpass" | "highpass" | "bandpass";
  hz: number;
}

export interface Cue {
  ms: number;
  notes: readonly Note[];
  noise: readonly NoiseHit[];
  /** The shortest gap between two plays of this cue, so a busy board does not buzz. */
  minGapMs: number;
}

export const CUES = {
  /** A service set down: a rising blip with a tick on top. */
  place: {
    ms: 110,
    notes: [{ at: 0, dur: 110, hz: 520, toHz: 700, wave: "triangle", gain: 0.2 }],
    noise: [{ at: 0, dur: 25, gain: 0.08, filter: "highpass", hz: 4000 }],
    minGapMs: 0,
  },
  /** A link made: a bright upward glide. */
  connect: {
    ms: 140,
    notes: [{ at: 0, dur: 140, hz: 880, toHz: 1320, wave: "sine", gain: 0.18 }],
    noise: [],
    minGapMs: 0,
  },
  /** A link or a service removed: a falling buzz with a soft thump. */
  delete: {
    ms: 200,
    notes: [{ at: 0, dur: 200, hz: 240, toHz: 110, wave: "sawtooth", gain: 0.12 }],
    noise: [{ at: 0, dur: 70, gain: 0.1, filter: "lowpass", hz: 600 }],
    minGapMs: 0,
  },
  /** A cache or CDN hit, an incident over: two quick sine notes. */
  success: {
    ms: 160,
    notes: [
      { at: 0, dur: 80, hz: 587.33, wave: "sine", gain: 0.1 },
      { at: 60, dur: 100, hz: 783.99, wave: "sine", gain: 0.1 },
    ],
    noise: [],
    minGapMs: 150,
  },
  /** A request dropped: a short low growl. */
  fail: {
    ms: 220,
    notes: [{ at: 0, dur: 220, hz: 160, toHz: 90, wave: "sawtooth", gain: 0.1 }],
    noise: [{ at: 0, dur: 60, gain: 0.06, filter: "bandpass", hz: 500 }],
    minGapMs: 150,
  },
  /** Malicious traffic stopped at the firewall: a high two-step ping. */
  fraudBlocked: {
    ms: 150,
    notes: [
      { at: 0, dur: 70, hz: 900, wave: "triangle", gain: 0.12 },
      { at: 60, dur: 90, hz: 1350, wave: "triangle", gain: 0.12 },
    ],
    noise: [],
    minGapMs: 150,
  },
  /** The run is over: four triangle notes stepping down. */
  gameOver: {
    ms: 1300,
    notes: [
      { at: 0, dur: 300, hz: 440, wave: "triangle", gain: 0.22 },
      { at: 330, dur: 300, hz: 392, wave: "triangle", gain: 0.22 },
      { at: 660, dur: 300, hz: 349.23, wave: "triangle", gain: 0.22 },
      { at: 990, dur: 310, hz: 293.66, wave: "triangle", gain: 0.22 },
    ],
    noise: [],
    minGapMs: 0,
  },
  /** An incident begins: a two-tone alarm with a hiss under it. */
  eventWarning: {
    ms: 480,
    notes: [
      { at: 0, dur: 150, hz: 420, wave: "square", gain: 0.08 },
      { at: 160, dur: 150, hz: 315, wave: "square", gain: 0.08 },
      { at: 320, dur: 160, hz: 420, wave: "square", gain: 0.08 },
    ],
    noise: [{ at: 0, dur: 300, gain: 0.04, filter: "bandpass", hz: 1800 }],
    minGapMs: 500,
  },
} as const satisfies Record<string, Cue>;

export type CueName = keyof typeof CUES;

/** The cue for a sim event, or null when it makes no sound. */
export function cueForEvent(event: SimEvent): CueName | null {
  switch (event.kind) {
    case "service-placed":
      return "place";
    case "link-added":
      return "connect";
    case "link-removed":
    case "service-removed":
      return "delete";
    case "cache-hit":
    case "event-end":
      return "success";
    case "request-failed":
      return "fail";
    case "request-blocked":
      return "fraudBlocked";
    case "game-over":
      return "gameOver";
    case "event-start":
    case "spike-start":
      return "eventWarning";
    case "service-upgraded":
    case "service-repaired":
    case "request-throttled":
    case "request-parked":
    case "request-recovered":
    case "request-retry":
    case "service-badge":
    case "money-short":
    case "warning":
    case "spike-end":
      return null;
  }
}
