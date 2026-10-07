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

  it("setMasterMuted ramps the master gain instead of stepping it", () => {
    const ctx = makeFakeCtx();
    ctx.currentTime = 2;
    const master = createMaster(ctx, false);
    setMasterMuted(master, true);
    const calls = ctx.gains[0]!.gain.calls;
    expect(calls[calls.length - 1]).toEqual({ m: "lin", v: 0, t: 2.01 });
    expect(calls.some((c) => c.m === "set" && c.t === 2)).toBe(true);
    expect(master.out.gain.value).toBe(1);
    setMasterMuted(master, false);
    expect(calls[calls.length - 1]).toEqual({ m: "lin", v: 1, t: 2.01 });
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

  it("stop() fades every voice over about 10 ms, then halts it", () => {
    const ctx = makeFakeCtx();
    const master = createMaster(ctx, false);
    const handle = scheduleCue(ctx, master.out, CUE, 0);
    ctx.currentTime = 0.3;
    handle.stop();
    for (const s of [...ctx.oscillators, ...ctx.noiseSources]) {
      expect(s.stopped[s.stopped.length - 1]).toBeCloseTo(0.312, 6);
    }
    for (const g of ctx.gains.slice(1)) {
      const last = g.gain.calls[g.gain.calls.length - 1]!;
      expect(last.m).toBe("lin");
      expect(last.v).toBe(0);
      expect(last.t).toBeCloseTo(0.31, 6);
    }
  });

  it("gives every noise hit a short linear attack before it decays", () => {
    const ctx = makeFakeCtx();
    const master = createMaster(ctx, false);
    scheduleCue(ctx, master.out, CUE, 0);
    // gains[0] is the master; the cue has two notes, then one noise hit.
    const noiseGain = ctx.gains[3]!;
    expect(noiseGain.gain.calls[0]).toEqual({ m: "set", v: 0.0001, t: 0.05 });
    expect(noiseGain.gain.calls[1]!.m).toBe("lin");
    expect(noiseGain.gain.calls[1]!.v).toBe(0.1);
    expect(noiseGain.gain.calls[1]!.t).toBeGreaterThan(0.05);
    expect(noiseGain.gain.calls[1]!.t).toBeLessThanOrEqual(0.055);
    expect(noiseGain.gain.calls[2]!.m).toBe("exp");
  });

  it("disconnects each voice from the graph when its source ends", () => {
    const ctx = makeFakeCtx();
    const master = createMaster(ctx, false);
    scheduleCue(ctx, master.out, CUE, 0);
    const osc = ctx.oscillators[0]!;
    const noise = ctx.noiseSources[0]!;
    expect(osc.onended).toBeTypeOf("function");
    osc.onended?.(new Event("ended"));
    noise.onended?.(new Event("ended"));
    expect(osc.disconnected).toBe(1);
    expect(ctx.gains[1]!.disconnected).toBe(1);
    expect(noise.disconnected).toBe(1);
    expect(ctx.filters[0]!.disconnected).toBe(1);
    expect(ctx.gains[3]!.disconnected).toBe(1);
  });
});
