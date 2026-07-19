// @vitest-environment node
//
// Runs in the node environment (not the suite-default jsdom) so `window` is
// genuinely undefined -- that is the "non-browser returns null" contract for
// getAudio, and it keeps every AudioContext reference out of the way. All audio
// is exercised through plain recording fakes; no real AudioContext, no jsdom
// audio.

import { describe, expect, it, beforeEach } from "vitest";
import {
  createBus,
  getAudio,
  isEnabled,
  playNoise,
  playTone,
  setEnabled,
  type AudioBus,
  type AudioContextLike,
} from "../audio";
import { MOTIFS, playCue } from "../motifs";

// --- Recording fakes --------------------------------------------------------

interface Rec {
  m: "set" | "lin" | "exp";
  v: number;
  t: number;
}

interface FakeParam {
  value: number;
  calls: Rec[];
  setValueAtTime(v: number, t: number): FakeParam;
  linearRampToValueAtTime(v: number, t: number): FakeParam;
  exponentialRampToValueAtTime(v: number, t: number): FakeParam;
}

function param(): FakeParam {
  const p: FakeParam = {
    value: 0,
    calls: [],
    setValueAtTime(v, t) {
      p.calls.push({ m: "set", v, t });
      return p;
    },
    linearRampToValueAtTime(v, t) {
      p.calls.push({ m: "lin", v, t });
      return p;
    },
    exponentialRampToValueAtTime(v, t) {
      p.calls.push({ m: "exp", v, t });
      return p;
    },
  };
  return p;
}

interface FakeCtx {
  currentTime: number;
  sampleRate: number;
  destination: { connect(): void };
  gains: { gain: FakeParam; connect(): void }[];
  oscillators: { type: string; frequency: FakeParam; detune: FakeParam }[];
  compressors: Record<"threshold" | "knee" | "ratio" | "attack" | "release", FakeParam>[];
  filters: { type: string; frequency: FakeParam }[];
  sources: { buffer: unknown }[];
  buffers: { getChannelData(): Float32Array }[];
  starts: number;
  createGain(): { gain: FakeParam; connect(): void };
  createOscillator(): { type: string; frequency: FakeParam; detune: FakeParam };
  createBiquadFilter(): { type: string; frequency: FakeParam };
  createDynamicsCompressor(): Record<
    "threshold" | "knee" | "ratio" | "attack" | "release",
    FakeParam
  >;
  createBuffer(c: number, length: number): { getChannelData(): Float32Array };
  createBufferSource(): { buffer: unknown };
}

function makeCtx(): FakeCtx {
  const ctx: FakeCtx = {
    currentTime: 0,
    sampleRate: 8000,
    destination: { connect() {} },
    gains: [],
    oscillators: [],
    compressors: [],
    filters: [],
    sources: [],
    buffers: [],
    starts: 0,
    createGain() {
      const g = { gain: param(), connect() {} };
      ctx.gains.push(g);
      return g;
    },
    createOscillator() {
      const o = {
        type: "sine",
        frequency: param(),
        detune: param(),
        connect() {},
        start() {
          ctx.starts++;
        },
        stop() {},
      };
      ctx.oscillators.push(o);
      return o;
    },
    createBiquadFilter() {
      const f = { type: "lowpass", frequency: param(), connect() {} };
      ctx.filters.push(f);
      return f;
    },
    createDynamicsCompressor() {
      const c = {
        threshold: param(),
        knee: param(),
        ratio: param(),
        attack: param(),
        release: param(),
        connect() {},
      };
      ctx.compressors.push(c);
      return c;
    },
    createBuffer(_c: number, length: number) {
      const b = { getChannelData: () => new Float32Array(length) };
      ctx.buffers.push(b);
      return b;
    },
    createBufferSource() {
      const s = {
        buffer: null as unknown,
        connect() {},
        start() {
          ctx.starts++;
        },
        stop() {},
      };
      ctx.sources.push(s);
      return s;
    },
  };
  return ctx;
}

function makeBus(): { ctx: FakeCtx; bus: AudioBus } {
  const ctx = makeCtx();
  const bus = createBus(ctx as unknown as AudioContextLike);
  return { ctx, bus };
}

const EXPECTED_KEYS = [
  "telegraph-doom",
  "inhabitant-arrive",
  "force-onset",
  "invasion-onset",
  "chrome-onset",
  "gerald-feed",
  "snake-chomp",
  "paper-shred",
  "parasite-wiggle",
  "act-fanfare",
  "missile-launch",
  "missile-intercept",
  "missile-land",
  "eula-burn",
  "knockback",
  "victory",
];

beforeEach(() => {
  setEnabled(false);
});

describe("createBus", () => {
  it("wires the limiter with the specified params and 0.9/0.5 gain defaults", () => {
    const { ctx, bus } = makeBus();
    const limiter = ctx.compressors[0]!;
    expect(limiter.threshold.value).toBe(-6);
    expect(limiter.knee.value).toBe(0);
    expect(limiter.ratio.value).toBe(20);
    expect(limiter.attack.value).toBe(0.003);
    expect(limiter.release.value).toBe(0.25);
    // Two named buses feed the limiter with the mix defaults.
    expect(bus.sfx.gain.value).toBe(0.9);
    expect(bus.music.gain.value).toBe(0.5);
    // sfx + music were the first two gains created.
    expect(ctx.gains.length).toBe(2);
  });
});

describe("playTone envelope", () => {
  it("ramps attack up to the peak, then releases, in that order", () => {
    const { ctx, bus } = makeBus();
    playTone(bus, {
      freq: 440,
      durMs: 200,
      type: "sine",
      gainPeak: 0.3,
      attackMs: 10,
      releaseMs: 150,
    });
    // gains[0] = sfx, gains[1] = music, gains[2] = the tone's own gain.
    const toneGain = ctx.gains[2]!;
    const kinds = toneGain.gain.calls.map((c) => c.m);
    expect(kinds).toEqual(["set", "lin", "exp"]);
    const attack = toneGain.gain.calls.find((c) => c.m === "lin")!;
    const release = toneGain.gain.calls.find((c) => c.m === "exp")!;
    expect(attack.v).toBe(0.3); // peak
    expect(kinds.indexOf("lin")).toBeLessThan(kinds.indexOf("exp")); // attack before release
    expect(release.t).toBeGreaterThan(attack.t); // release scheduled later
    // The oscillator carried the requested frequency.
    expect(ctx.oscillators[0]!.frequency.calls[0]!.v).toBe(440);
  });
});

describe("playNoise", () => {
  it("fills a buffer, decays it, and starts a source", () => {
    const { ctx, bus } = makeBus();
    playNoise(bus, { durMs: 100, gainPeak: 0.2, filterHz: 1000 });
    expect(ctx.buffers.length).toBe(1);
    expect(ctx.sources.length).toBe(1);
    expect(ctx.filters.length).toBe(1); // filterHz supplied -> a lowpass exists
    expect(ctx.starts).toBe(1);
  });
});

describe("MOTIFS registry", () => {
  it("contains exactly the sixteen named cues", () => {
    expect(Object.keys(MOTIFS).sort()).toEqual([...EXPECTED_KEYS].sort());
    expect(Object.keys(MOTIFS)).toHaveLength(16);
  });

  it("every cue schedules at least one node without throwing", () => {
    for (const [name, cue] of Object.entries(MOTIFS)) {
      const { ctx, bus } = makeBus();
      expect(() => cue(bus), name).not.toThrow();
      expect(ctx.starts, name).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("playCue gating", () => {
  it("no-ops on an unknown key without throwing", () => {
    setEnabled(true);
    expect(() => playCue("no-such-cue")).not.toThrow();
  });

  it("schedules nothing while disabled or with no browser audio", () => {
    setEnabled(false);
    expect(isEnabled()).toBe(false);
    expect(() => playCue("victory")).not.toThrow();
    // Even enabled, node has no AudioContext, so nothing can be scheduled.
    setEnabled(true);
    expect(getAudio()).toBeNull();
    expect(() => playCue("victory")).not.toThrow();
  });
});

describe("getAudio / enabled state", () => {
  it("returns null outside the browser", () => {
    expect(getAudio()).toBeNull();
  });

  it("defaults to disabled and toggles via setEnabled", () => {
    setEnabled(false);
    expect(isEnabled()).toBe(false);
    setEnabled(true);
    expect(isEnabled()).toBe(true);
  });
});
