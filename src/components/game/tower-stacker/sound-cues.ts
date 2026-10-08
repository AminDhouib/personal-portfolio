// Tower Stacker's synthesized cues: tables of notes and noise hits that synth.ts
// turns into Web Audio nodes. No sample files. Times are milliseconds from the start
// of the cue; `ms` is the cue's nominal length.

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

/** E5. */
const BELL_HZ = 659.25;
/** The bell stops rising after this many streak steps. */
const BELL_MAX_STEPS = 8;

/** The perfect bell: E5, a semitone higher per streak step, capped. */
export function perfectCue(streak: number): Cue {
  const hz = BELL_HZ * 2 ** (Math.min(Math.max(streak, 0), BELL_MAX_STEPS) / 12);
  return {
    ms: 420,
    notes: [
      { at: 0, dur: 420, hz, wave: "sine", gain: 0.3 },
      { at: 0, dur: 260, hz: hz * 2, wave: "triangle", gain: 0.1 },
    ],
    noise: [],
  };
}

export const CUES = {
  /** A landing: a low thud with a short click. */
  drop: {
    ms: 160,
    notes: [{ at: 0, dur: 160, hz: 190, toHz: 55, wave: "sine", gain: 0.5 }],
    noise: [{ at: 0, dur: 40, gain: 0.25, filter: "bandpass", hz: 720 }],
  },
  /** The block regrew: a two-note chime. */
  grow: {
    ms: 350,
    notes: [
      { at: 0, dur: 160, hz: 880, wave: "sine", gain: 0.25 },
      { at: 90, dur: 260, hz: 1318.51, wave: "sine", gain: 0.25 },
    ],
    noise: [],
  },
  /** An overhang sheared off. */
  trim: {
    ms: 110,
    notes: [],
    noise: [{ at: 0, dur: 90, gain: 0.3, filter: "highpass", hz: 2400 }],
  },
  /** A full miss: a detuned saw falling away. */
  miss: {
    ms: 900,
    notes: [
      { at: 0, dur: 900, hz: 330, toHz: 58, wave: "sawtooth", gain: 0.18 },
      { at: 0, dur: 900, hz: 334, toHz: 59, wave: "sawtooth", gain: 0.18 },
    ],
    noise: [],
  },
  /** Every tenth floor: a three-note arpeggio. */
  milestone: {
    ms: 440,
    notes: [
      { at: 0, dur: 220, hz: 523.25, wave: "triangle", gain: 0.25 },
      { at: 110, dur: 220, hz: 659.25, wave: "triangle", gain: 0.25 },
      { at: 220, dur: 220, hz: 783.99, wave: "triangle", gain: 0.25 },
    ],
    noise: [],
  },
} as const satisfies Record<string, Cue>;
