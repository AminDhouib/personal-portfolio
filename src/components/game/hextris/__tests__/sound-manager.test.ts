import { afterEach, describe, expect, it, vi } from "vitest";
import { HextrisSounds } from "../sound-manager";

// A minimal AudioContext fake: every node is a stub, and each oscillator records the frequency
// written to it and the time it was started, so a test can read back what a cue scheduled.

interface FakeOsc {
  freq: number;
  startAt: number;
}

function makeParam() {
  return {
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  };
}

function makeNode(extra: Record<string, unknown> = {}) {
  return {
    connect: (n: unknown) => n,
    start() {},
    stop() {},
    gain: makeParam(),
    frequency: makeParam(),
    ...extra,
  };
}

function installFakeAudio(): FakeOsc[] {
  const oscs: FakeOsc[] = [];
  class FakeAudioContext {
    state = "running";
    currentTime = 10;
    sampleRate = 8000;
    destination = makeNode();
    resume() {
      return Promise.resolve();
    }
    createGain() {
      return makeNode();
    }
    createOscillator() {
      const rec: FakeOsc = { freq: 0, startAt: -1 };
      oscs.push(rec);
      return makeNode({
        frequency: {
          ...makeParam(),
          set value(v: number) {
            rec.freq = v;
          },
          get value() {
            return rec.freq;
          },
        },
        start(t: number) {
          rec.startAt = t;
        },
      });
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  return oscs;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HextrisSounds.newBest", () => {
  it("plays a rising run of notes that starts after the game-over sting", () => {
    const oscs = installFakeAudio();
    const sounds = new HextrisSounds();
    sounds.newBest();
    expect(oscs.length).toBeGreaterThanOrEqual(4);
    const freqs = oscs.map((o) => o.freq);
    expect([...freqs].sort((a, b) => a - b)).toEqual(freqs);
    const starts = oscs.map((o) => o.startAt);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    // The fake clock reads 10 s; the run waits for the sting to land.
    expect(starts[0]).toBeGreaterThan(10.2);
  });

  it("is its own cue, not the clean-sweep fanfare", () => {
    const best = installFakeAudio();
    new HextrisSounds().newBest();
    const sweep = installFakeAudio();
    new HextrisSounds().cleanSweep();
    expect(best.map((o) => o.freq)).not.toEqual(sweep.map((o) => o.freq));
  });

  it("stays silent when sound is off", () => {
    const oscs = installFakeAudio();
    const sounds = new HextrisSounds();
    sounds.setEnabled(false);
    sounds.newBest();
    expect(oscs).toHaveLength(0);
  });
});
