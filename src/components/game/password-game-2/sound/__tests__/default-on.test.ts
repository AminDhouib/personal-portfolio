import { afterEach, describe, expect, it, vi } from "vitest";

// Each test loads a fresh copy of the sound modules: the enabled flag, the bus and the
// unlock flag are module singletons, so one test's state would otherwise leak into the next.
async function fresh() {
  vi.resetModules();
  const audio = await import("../audio");
  const motifs = await import("../motifs");
  return { ...audio, ...motifs };
}

interface FakeNode {
  connect(): void;
}

function makeCtxClass(opts: { state: string; resume?: () => Promise<void> }) {
  const created = { oscillators: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  class Ctx {
    state = opts.state;
    resume = opts.resume ?? (async () => {});
    currentTime = 0;
    sampleRate = 44100;
    destination: FakeNode = { connect() {} };
    createGain() {
      return { gain: param(), connect() {} };
    }
    createOscillator() {
      created.oscillators++;
      return { type: "sine", frequency: param(), connect() {}, start() {}, stop() {} };
    }
    createDynamicsCompressor() {
      const p = { value: 0 };
      return { threshold: p, knee: p, ratio: p, attack: p, release: p, connect() {} };
    }
  }
  return { Ctx, created };
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("sound default", () => {
  it("is on when the key is absent", async () => {
    const { hydrateEnabled, isEnabled } = await fresh();
    expect(hydrateEnabled()).toBe(true);
    expect(isEnabled()).toBe(true);
  });

  it("respects an explicit off", async () => {
    localStorage.setItem("pg2-sound", "0");
    const { hydrateEnabled, isEnabled } = await fresh();
    expect(hydrateEnabled()).toBe(false);
    expect(isEnabled()).toBe(false);
  });

  it("respects an explicit on (legacy value)", async () => {
    localStorage.setItem("pg2-sound", "1");
    const { hydrateEnabled } = await fresh();
    expect(hydrateEnabled()).toBe(true);
  });

  it("is on when storage cannot be read", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { hydrateEnabled } = await fresh();
    expect(hydrateEnabled()).toBe(true);
    vi.restoreAllMocks();
  });

  it("setEnabled(false) persists 0 and survives a rehydrate", async () => {
    const { setEnabled, hydrateEnabled } = await fresh();
    setEnabled(false);
    expect(localStorage.getItem("pg2-sound")).toBe("0");
    expect(hydrateEnabled()).toBe(false);
  });

  it("setEnabled(true) persists 1 and survives a rehydrate", async () => {
    const { setEnabled, hydrateEnabled } = await fresh();
    setEnabled(false);
    setEnabled(true);
    expect(localStorage.getItem("pg2-sound")).toBe("1");
    expect(hydrateEnabled()).toBe(true);
  });
});

describe("unlockAudio", () => {
  it("creates the context and resumes it when suspended", async () => {
    const resume = vi.fn(async () => {});
    const { Ctx } = makeCtxClass({ state: "suspended", resume });
    vi.stubGlobal("AudioContext", Ctx);
    const { unlockAudio, getAudio } = await fresh();
    unlockAudio();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(getAudio()).not.toBeNull();
  });

  it("does not resume a context that is already running", async () => {
    const resume = vi.fn(async () => {});
    const { Ctx } = makeCtxClass({ state: "running", resume });
    vi.stubGlobal("AudioContext", Ctx);
    const { unlockAudio } = await fresh();
    unlockAudio();
    expect(resume).not.toHaveBeenCalled();
  });

  it("never throws without AudioContext", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const { unlockAudio, isEnabled } = await fresh();
    expect(() => unlockAudio()).not.toThrow();
    expect(isEnabled()).toBe(true);
  });

  it("swallows a rejected resume", async () => {
    const resume = vi.fn(async () => {
      throw new Error("blocked");
    });
    const { Ctx } = makeCtxClass({ state: "suspended", resume });
    vi.stubGlobal("AudioContext", Ctx);
    const { unlockAudio } = await fresh();
    expect(() => unlockAudio()).not.toThrow();
    await Promise.resolve();
  });
});

describe("nothing plays before the Start tap", () => {
  it("a cue is silent until unlockAudio has run, then plays", async () => {
    const { Ctx, created } = makeCtxClass({ state: "running" });
    vi.stubGlobal("AudioContext", Ctx);
    const { playCue, unlockAudio } = await fresh();
    playCue("key-tick");
    expect(created.oscillators).toBe(0);
    unlockAudio();
    playCue("key-tick");
    expect(created.oscillators).toBeGreaterThan(0);
  });

  it("an explicit off stays silent even after the unlock", async () => {
    localStorage.setItem("pg2-sound", "0");
    const { Ctx, created } = makeCtxClass({ state: "running" });
    vi.stubGlobal("AudioContext", Ctx);
    const { playCue, unlockAudio } = await fresh();
    unlockAudio();
    playCue("key-tick");
    expect(created.oscillators).toBe(0);
  });
});
