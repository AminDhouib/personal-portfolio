// Script Knight's synthesized cues: tables of notes and noise hits that synth.ts turns into Web
// Audio nodes. No sample files. Times are milliseconds from the start of the cue; `ms` is the
// cue's nominal length. (The types are a copy of Tower Stacker's: games do not import each other.)

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
}

export const CUES = {
  /** A footstep: a short low tick. */
  step: {
    ms: 70,
    notes: [{ at: 0, dur: 70, hz: 220, toHz: 140, wave: "triangle", gain: 0.18 }],
    noise: [],
  },
  /** A blow landing: a thud with a bright click. */
  hit: {
    ms: 150,
    notes: [{ at: 0, dur: 150, hz: 170, toHz: 60, wave: "sine", gain: 0.4 }],
    noise: [{ at: 0, dur: 50, gain: 0.22, filter: "bandpass", hz: 900 }],
  },
  /** A captive freed: a two-note chime. */
  rescue: {
    ms: 330,
    notes: [
      { at: 0, dur: 150, hz: 784, wave: "sine", gain: 0.22 },
      { at: 90, dur: 240, hz: 1174.66, wave: "sine", gain: 0.22 },
    ],
    noise: [],
  },
  /** The stairs reached: a rising three-note fanfare. */
  stairs: {
    ms: 520,
    notes: [
      { at: 0, dur: 220, hz: 523.25, wave: "triangle", gain: 0.25 },
      { at: 130, dur: 220, hz: 659.25, wave: "triangle", gain: 0.25 },
      { at: 260, dur: 260, hz: 783.99, wave: "triangle", gain: 0.25 },
    ],
    noise: [],
  },
  /** The warrior fell: a detuned saw falling away. */
  fail: {
    ms: 800,
    notes: [
      { at: 0, dur: 800, hz: 300, toHz: 55, wave: "sawtooth", gain: 0.16 },
      { at: 0, dur: 800, hz: 304, toHz: 56, wave: "sawtooth", gain: 0.16 },
    ],
    noise: [],
  },
} as const satisfies Record<string, Cue>;

export type CueName = keyof typeof CUES;

/** The cue for an engine event, or null when it makes no sound. */
export function cueFor(eventType: string): CueName | null {
  switch (eventType) {
    case "walk":
    case "pivot":
      return "step";
    case "takeDamage":
    case "attack":
    case "shoot":
    case "detonate":
      return "hit";
    case "rescue":
    case "release":
      return "rescue";
    default:
      return null;
  }
}
