import { describe, it, expect } from "vitest";
import { createMaster, scheduleCue, setMasterMuted } from "../synth";
import type { Cue } from "../sound-cues";
import { makeFakeCtx } from "./fake-ctx";

const CUE: Cue = {
  ms: 500,
  notes: [
    { at: 0, dur: 100, hz: 440, wave: "square", gain: 0.1 },
    { at: 200, dur: 300, hz: 220, toHz: 110, wave: "sawtooth", gain: 0.2 },
  ],
  noise: [{ at: 50, dur: 80, gain: 0.1, lowpassHz: 2000 }],
};

describe("createMaster", () => {
  it("starts silent when created muted, and audible otherwise", () => {
    const muted = createMaster(makeFakeCtx(), true);
    expect(muted.out.gain.value).toBe(0);
    const live = createMaster(makeFakeCtx(), false);
    expect(live.out.gain.value).toBe(1);
  });

  it("setMasterMuted flips the master gain immediately", () => {
    const master = createMaster(makeFakeCtx(), false);
    setMasterMuted(master, true);
    expect(master.out.gain.value).toBe(0);
    setMasterMuted(master, false);
    expect(master.out.gain.value).toBe(1);
  });
});

describe("scheduleCue", () => {
  it("creates one oscillator per note and one source per noise hit", () => {
    const ctx = makeFakeCtx();
    const master = createMaster(ctx, false);
    scheduleCue(ctx, master.out, CUE, 10);
    expect(ctx.oscillators).toHaveLength(2);
    expect(ctx.noiseSources).toHaveLength(1);
  });

  it("offsets each voice from the start time and stops it after its length", () => {
    const ctx = makeFakeCtx();
    const master = createMaster(ctx, false);
    scheduleCue(ctx, master.out, CUE, 10);
    const [a, b] = ctx.oscillators;
    expect(a!.started[0]).toBeCloseTo(10, 6);
    expect(b!.started[0]).toBeCloseTo(10.2, 6);
    expect(a!.stopped[0]).toBeGreaterThanOrEqual(10.1);
    expect(b!.stopped[0]).toBeGreaterThanOrEqual(10.5);
    expect(a!.type).toBe("square");
    expect(b!.type).toBe("sawtooth");
  });

  it("sets the pitch, and glides when toHz is given", () => {
    const ctx = makeFakeCtx();
    const master = createMaster(ctx, false);
    scheduleCue(ctx, master.out, CUE, 0);
    const [a, b] = ctx.oscillators;
    expect(a!.frequency.calls).toEqual([{ m: "set", v: 440, t: 0 }]);
    expect(b!.frequency.calls[0]).toEqual({ m: "set", v: 220, t: 0.2 });
    expect(b!.frequency.calls[1]!.m).toBe("exp");
    expect(b!.frequency.calls[1]!.v).toBe(110);
    expect(b!.frequency.calls[1]!.t).toBeCloseTo(0.5, 6);
  });

  it("never ramps a gain to zero (exponential ramps cannot reach it)", () => {
    const ctx = makeFakeCtx();
    const master = createMaster(ctx, false);
    scheduleCue(ctx, master.out, CUE, 0);
    for (const g of ctx.gains.slice(1)) {
      for (const call of g.gain.calls) {
        if (call.m === "exp") expect(call.v).toBeGreaterThan(0);
      }
    }
  });

  it("stop() halts every voice at the current context time", () => {
    const ctx = makeFakeCtx();
    const master = createMaster(ctx, false);
    const handle = scheduleCue(ctx, master.out, CUE, 0);
    ctx.currentTime = 0.3;
    handle.stop();
    for (const s of [...ctx.oscillators, ...ctx.noiseSources]) {
      expect(s.stopped[s.stopped.length - 1]).toBe(0.3);
    }
  });
});
