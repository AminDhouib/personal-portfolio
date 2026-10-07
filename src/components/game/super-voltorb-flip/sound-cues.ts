// Original sound design for Super Voltorb Flip. Every effect and fanfare is a
// table of notes and noise hits; synth.ts turns a table into Web Audio nodes.
// Nothing here is transcribed from any game: the figures are our own. Times
// are milliseconds from the start of the cue, pitches are MIDI numbers
// converted once at load. Cue lengths (`ms`) are a gameplay timing contract:
// the win sequence waits for `levelClear`, and the risk fanfare gates the board
// for exactly RISK_WARNING_MS (the same figure the muted path waits).

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
  lowpassHz: number;
}

export interface Cue {
  ms: number;
  notes: readonly Note[];
  noise: readonly NoiseHit[];
}

export const RISK_WARNING_MS = 2100;
export const LEVEL_WIN_MS = 2000;
export const GAME_OVER_MS = 2600;

export function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function note(
  at: number,
  dur: number,
  midi: number,
  wave: Wave,
  gain: number,
  toMidi?: number,
): Note {
  const base = { at, dur, hz: midiHz(midi), wave, gain };
  return toMidi === undefined ? base : { ...base, toHz: midiHz(toMidi) };
}

const NO_NOISE: readonly NoiseHit[] = [];

// Tense alarm for a high-risk flip: eight short square pulses alternating a
// semitone apart and climbing, then a low saw drone that holds to the end.
function riskNotes(): Note[] {
  const pulses: Note[] = [];
  for (let i = 0; i < 8; i++) {
    const midi = (i % 2 === 0 ? 64 : 63) + Math.floor(i / 2);
    pulses.push(note(i * 180, 150, midi, "square", 0.1));
  }
  pulses.push(note(1500, RISK_WARNING_MS - 1500, 40, "sawtooth", 0.16, 38));
  return pulses;
}

export const CUES = {
  /** Tile flip: a soft rising tick with a breath of noise. */
  flip: {
    ms: 70,
    notes: [note(0, 60, 76, "triangle", 0.16, 83)],
    noise: [{ at: 0, dur: 35, gain: 0.1, lowpassHz: 3500 }],
  },
  /** Voltorb hit: a falling saw buzz over a low noise thump. */
  voltorbPop: {
    ms: 280,
    notes: [note(0, 260, 52, "sawtooth", 0.22, 36)],
    noise: [{ at: 0, dur: 200, gain: 0.25, lowpassHz: 1200 }],
  },
  /** Earn counter tick (every 4th rollup step). */
  payoutTickEarn: {
    ms: 50,
    notes: [note(0, 40, 88, "triangle", 0.1)],
    noise: NO_NOISE,
  },
  /** Drain tick (every 4th wallet step). */
  payoutTickBank: {
    ms: 50,
    notes: [note(0, 40, 79, "square", 0.07)],
    noise: NO_NOISE,
  },
  /** Closing two-note chime of the payout chain. */
  payoutFinal: {
    ms: 460,
    notes: [note(0, 160, 84, "triangle", 0.16), note(110, 350, 91, "triangle", 0.16)],
    noise: NO_NOISE,
  },
  /** Memo flag toggled: two quick blips. */
  memoToggle: {
    ms: 100,
    notes: [note(0, 50, 79, "square", 0.07), note(45, 55, 84, "square", 0.07)],
    noise: NO_NOISE,
  },
  /** Cursor moved. */
  cursorMove: {
    ms: 45,
    notes: [note(0, 35, 72, "square", 0.05)],
    noise: NO_NOISE,
  },
  /** Tap on a revealed tile or a disallowed action: a low dull blip. */
  invalidTap: {
    ms: 120,
    notes: [note(0, 110, 43, "square", 0.1, 41)],
    noise: NO_NOISE,
  },
  /** Memo Back / Clear. */
  backButton: {
    ms: 80,
    notes: [note(0, 60, 72, "triangle", 0.11, 64)],
    noise: NO_NOISE,
  },
  /** Confirmation tone (Quit confirm and similar). */
  decide: {
    ms: 220,
    notes: [note(0, 70, 76, "square", 0.08), note(70, 150, 83, "square", 0.08)],
    noise: NO_NOISE,
  },
  /** Memo drawer slide: a short filtered sweep. */
  memoSlide: {
    ms: 130,
    notes: [note(0, 110, 60, "triangle", 0.06, 72)],
    noise: [{ at: 0, dur: 120, gain: 0.08, lowpassHz: 2400 }],
  },
  /** Level went up: a bright four-note rise. */
  levelUp: {
    ms: 740,
    notes: [
      note(0, 110, 72, "triangle", 0.16),
      note(100, 110, 76, "triangle", 0.16),
      note(200, 110, 79, "triangle", 0.16),
      note(300, 440, 84, "triangle", 0.16),
    ],
    noise: NO_NOISE,
  },
  /** Level went down: the same four notes falling, ending lower. */
  levelDown: {
    ms: 840,
    notes: [
      note(0, 110, 84, "triangle", 0.16),
      note(100, 110, 79, "triangle", 0.16),
      note(200, 110, 76, "triangle", 0.16),
      note(300, 540, 67, "triangle", 0.16),
    ],
    noise: NO_NOISE,
  },
  /** High-risk flip warning; the board is locked for RISK_WARNING_MS. */
  riskWarning: {
    ms: RISK_WARNING_MS,
    notes: riskNotes(),
    noise: NO_NOISE,
  },
  /** Round cleared: a rising arpeggio resolving into a held major chord. */
  levelClear: {
    ms: LEVEL_WIN_MS,
    notes: [
      note(0, 140, 72, "triangle", 0.16),
      note(140, 140, 76, "triangle", 0.16),
      note(280, 140, 79, "triangle", 0.16),
      note(420, 260, 84, "triangle", 0.16),
      note(760, LEVEL_WIN_MS - 760, 72, "triangle", 0.1),
      note(760, LEVEL_WIN_MS - 760, 76, "triangle", 0.1),
      note(760, LEVEL_WIN_MS - 760, 79, "triangle", 0.1),
      note(760, LEVEL_WIN_MS - 760, 84, "square", 0.05),
    ],
    noise: NO_NOISE,
  },
  /** Round lost: a slow minor descent settling on a low drone. */
  gameOver: {
    ms: GAME_OVER_MS,
    notes: [
      note(0, 300, 69, "triangle", 0.16),
      note(300, 300, 65, "triangle", 0.16),
      note(600, 300, 62, "triangle", 0.16),
      note(900, GAME_OVER_MS - 900, 57, "triangle", 0.16),
      note(900, GAME_OVER_MS - 900, 45, "sawtooth", 0.07),
    ],
    noise: NO_NOISE,
  },
} satisfies Record<string, Cue>;
