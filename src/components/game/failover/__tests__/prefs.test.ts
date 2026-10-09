import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUDIO_KEY,
  COACH_KEY,
  GFX_KEY,
  loadAudioOn,
  loadCoachDone,
  loadGfxPref,
  parseAudioOn,
  parseCoachDone,
  parseGfxPref,
  saveAudioOn,
  saveCoachDone,
  saveGfxPref,
} from "../prefs";

// Pins the two localStorage shapes Failover writes. Changing either later
// without a migration would silently reset a player's choice.

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("failover:audio", () => {
  it("is its own key", () => {
    expect(AUDIO_KEY).toBe("failover:audio");
  });

  it("defaults to sound off", () => {
    expect(loadAudioOn()).toBe(false);
  });

  it("writes exactly this JSON (the pinned stored shape)", () => {
    saveAudioOn(true);
    expect(window.localStorage.getItem("failover:audio")).toBe('{"v":1,"on":true}');
    saveAudioOn(false);
    expect(window.localStorage.getItem("failover:audio")).toBe('{"v":1,"on":false}');
  });

  it("round-trips", () => {
    saveAudioOn(true);
    expect(loadAudioOn()).toBe(true);
    saveAudioOn(false);
    expect(loadAudioOn()).toBe(false);
  });

  it("reads anything that is not a v1 object with a boolean as sound off", () => {
    for (const raw of [null, 7, "x", [], { v: 2, on: true }, { on: true }, { v: 1, on: "yes" }]) {
      expect(parseAudioOn(raw)).toBe(false);
    }
    expect(parseAudioOn({ v: 1, on: true })).toBe(true);
    expect(parseAudioOn({ v: 1, on: true, extra: 1 })).toBe(true);
  });

  it("survives corrupt JSON and blocked storage", () => {
    window.localStorage.setItem("failover:audio", "{not json");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("reportError", vi.fn());
    expect(loadAudioOn()).toBe(false);
    vi.unstubAllGlobals();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(loadAudioOn()).toBe(false);
  });

  it("does not overwrite a value a newer build wrote", () => {
    window.localStorage.setItem("failover:audio", '{"v":2,"on":true,"volume":3}');
    saveAudioOn(false);
    expect(window.localStorage.getItem("failover:audio")).toBe('{"v":2,"on":true,"volume":3}');
  });
});

describe("failover:gfx", () => {
  it("is its own key", () => {
    expect(GFX_KEY).toBe("failover:gfx");
  });

  it("defaults to auto", () => {
    expect(loadGfxPref()).toBe("auto");
  });

  it("writes exactly this JSON (the pinned stored shape)", () => {
    saveGfxPref("low");
    expect(window.localStorage.getItem("failover:gfx")).toBe('{"v":1,"tier":"low"}');
    saveGfxPref("high");
    expect(window.localStorage.getItem("failover:gfx")).toBe('{"v":1,"tier":"high"}');
    saveGfxPref("auto");
    expect(window.localStorage.getItem("failover:gfx")).toBe('{"v":1,"tier":"auto"}');
  });

  it("round-trips every choice", () => {
    for (const tier of ["auto", "high", "low"] as const) {
      saveGfxPref(tier);
      expect(loadGfxPref()).toBe(tier);
    }
  });

  it("reads anything else as auto", () => {
    for (const raw of [
      null,
      "low",
      { v: 1, tier: "ultra" },
      { v: 2, tier: "low" },
      { tier: "low" },
    ]) {
      expect(parseGfxPref(raw)).toBe("auto");
    }
    expect(parseGfxPref({ v: 1, tier: "low", extra: 1 })).toBe("low");
  });

  it("never touches the audio key", () => {
    saveAudioOn(true);
    saveGfxPref("low");
    loadGfxPref();
    expect(window.localStorage.getItem("failover:audio")).toBe('{"v":1,"on":true}');
  });
});

describe("failover:coach", () => {
  it("is its own key", () => {
    expect(COACH_KEY).toBe("failover:coach");
  });

  it("defaults to not done, so a first run shows the coach", () => {
    expect(loadCoachDone()).toBe(false);
  });

  it("writes exactly this JSON (the pinned stored shape)", () => {
    saveCoachDone(true);
    expect(window.localStorage.getItem("failover:coach")).toBe('{"v":1,"done":true}');
    saveCoachDone(false);
    expect(window.localStorage.getItem("failover:coach")).toBe('{"v":1,"done":false}');
  });

  it("round-trips", () => {
    saveCoachDone(true);
    expect(loadCoachDone()).toBe(true);
    saveCoachDone(false);
    expect(loadCoachDone()).toBe(false);
  });

  it("reads anything that is not a v1 object with a boolean as not done", () => {
    for (const raw of [
      null,
      1,
      "done",
      [],
      [{ v: 1, done: true }],
      { v: 2, done: true },
      { done: true },
      { v: 1, done: "true" },
      { v: 1, done: 1 },
    ]) {
      expect(parseCoachDone(raw)).toBe(false);
    }
    expect(parseCoachDone({ v: 1, done: true, extra: 1 })).toBe(true);
  });

  it("survives corrupt JSON, a __proto__ payload and blocked storage", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("reportError", vi.fn());
    window.localStorage.setItem("failover:coach", "{not json");
    expect(loadCoachDone()).toBe(false);
    window.localStorage.setItem("failover:coach", '{"__proto__":{"v":1,"done":true}}');
    expect(loadCoachDone()).toBe(false);
    vi.unstubAllGlobals();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(loadCoachDone()).toBe(false);
  });

  it("does not overwrite a value a newer build wrote", () => {
    window.localStorage.setItem("failover:coach", '{"v":2,"step":3}');
    saveCoachDone(true);
    expect(window.localStorage.getItem("failover:coach")).toBe('{"v":2,"step":3}');
  });

  it("never touches the other keys", () => {
    saveAudioOn(true);
    saveGfxPref("low");
    saveCoachDone(true);
    expect(window.localStorage.getItem("failover:audio")).toBe('{"v":1,"on":true}');
    expect(window.localStorage.getItem("failover:gfx")).toBe('{"v":1,"tier":"low"}');
  });
});
