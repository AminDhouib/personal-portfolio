import { describe, it, expect, vi, afterEach } from "vitest";
import { SoundManager } from "../sound-manager";
import { killPitch } from "../difficulty";

// A minimal AudioContext fake: every node is a stub, and each oscillator
// records the values written to its frequency param so a test can read back
// what pitch a sound was scheduled at.

interface FakeOsc {
  freqs: number[];
}

function makeParam(sink?: number[]) {
  return {
    value: 0,
    setValueAtTime(v: number) {
      sink?.push(v);
    },
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
    cancelScheduledValues() {},
  };
}

function makeNode(extra: Record<string, unknown> = {}) {
  const node: Record<string, unknown> = {
    connect: (n: unknown) => n,
    start() {},
    stop() {},
    gain: makeParam(),
    frequency: makeParam(),
    Q: makeParam(),
    threshold: makeParam(),
    knee: makeParam(),
    ratio: makeParam(),
    attack: makeParam(),
    release: makeParam(),
    delayTime: makeParam(),
    ...extra,
  };
  return node;
}

function installFakeAudio(): FakeOsc[] {
  const oscs: FakeOsc[] = [];
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    sampleRate = 8000;
    destination = makeNode();
    resume() {
      return Promise.resolve();
    }
    createDynamicsCompressor() {
      return makeNode();
    }
    createGain() {
      return makeNode();
    }
    createDelay() {
      return makeNode();
    }
    createBiquadFilter() {
      return makeNode();
    }
    createBuffer(_ch: number, len: number) {
      const data = new Float32Array(len);
      return { getChannelData: () => data };
    }
    createBufferSource() {
      return makeNode();
    }
    createOscillator() {
      const rec: FakeOsc = { freqs: [] };
      oscs.push(rec);
      return makeNode({ frequency: makeParam(rec.freqs) });
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  return oscs;
}

describe("killPitch", () => {
  it("rises from 1 at combo 1 to 1.7 at combo 21 and stays there", () => {
    expect(killPitch(1)).toBe(1);
    expect(killPitch(11)).toBeCloseTo(1.35, 10);
    expect(killPitch(21)).toBeCloseTo(1.7, 10);
    expect(killPitch(99)).toBeCloseTo(1.7, 10);
  });
});

describe("SoundManager boom pitch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function boomFirstFreq(opts?: { pitch: number }): number {
    const oscs = installFakeAudio();
    const sm = new SoundManager();
    sm.setEnabled(true);
    sm.play("boom", opts);
    const first = oscs[0];
    expect(first).toBeDefined();
    return first!.freqs[0]!;
  }

  it("schedules the boom oscillator at 1.5x the base frequency with pitch 1.5", () => {
    const base = boomFirstFreq();
    const raised = boomFirstFreq({ pitch: 1.5 });
    expect(base).toBeGreaterThan(0);
    expect(raised).toBeCloseTo(base * 1.5, 10);
  });

  it("keeps the 45 ms boom throttle", () => {
    const oscs = installFakeAudio();
    let clock = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const sm = new SoundManager();
    sm.setEnabled(true);
    sm.play("boom", { pitch: 1.2 });
    const afterFirst = oscs.length;
    clock += 20;
    sm.play("boom", { pitch: 1.2 });
    expect(oscs.length).toBe(afterFirst);
    clock += 40;
    sm.play("boom", { pitch: 1.2 });
    expect(oscs.length).toBeGreaterThan(afterFirst);
  });
});
