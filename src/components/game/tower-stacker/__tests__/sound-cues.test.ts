// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CUES, perfectCue } from "../sound-cues";

describe("CUES", () => {
  it("pins each fixed cue's pitches and length", () => {
    const summary = Object.fromEntries(
      Object.entries(CUES).map(([name, cue]) => [
        name,
        {
          ms: cue.ms,
          notes: cue.notes.map((n) => [
            Math.round(n.hz * 100) / 100,
            n.toHz ? Math.round(n.toHz) : null,
            n.wave,
          ]),
          noise: cue.noise.map((n) => [n.filter, n.hz]),
        },
      ]),
    );
    expect(summary).toEqual({
      drop: { ms: 160, notes: [[190, 55, "sine"]], noise: [["bandpass", 720]] },
      grow: {
        ms: 350,
        notes: [
          [880, null, "sine"],
          [1318.51, null, "sine"],
        ],
        noise: [],
      },
      trim: { ms: 110, notes: [], noise: [["highpass", 2400]] },
      miss: {
        ms: 900,
        notes: [
          [330, 58, "sawtooth"],
          [334, 59, "sawtooth"],
        ],
        noise: [],
      },
      milestone: {
        ms: 440,
        notes: [
          [523.25, null, "triangle"],
          [659.25, null, "triangle"],
          [783.99, null, "triangle"],
        ],
        noise: [],
      },
    });
  });

  it("every note and hit ends inside its cue length", () => {
    for (const cue of [...Object.values(CUES), perfectCue(3)]) {
      for (const n of cue.notes) expect(n.at + n.dur).toBeLessThanOrEqual(cue.ms);
      for (const h of cue.noise) expect(h.at + h.dur).toBeLessThanOrEqual(cue.ms);
    }
  });
});

describe("perfectCue", () => {
  const bell = (streak: number) => perfectCue(streak).notes[0]?.hz ?? 0;

  it("starts on E5 and rises a semitone per streak step", () => {
    expect(bell(0)).toBeCloseTo(659.25, 2);
    expect(bell(1)).toBeCloseTo(659.25 * 2 ** (1 / 12), 2);
    expect(bell(2)).toBeGreaterThan(bell(1));
  });

  it("stops rising at streak 8", () => {
    expect(bell(8)).toBeCloseTo(659.25 * 2 ** (8 / 12), 2);
    expect(bell(9)).toBe(bell(8));
    expect(bell(40)).toBe(bell(8));
  });
});
