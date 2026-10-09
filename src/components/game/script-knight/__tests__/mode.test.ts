import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultMode, loadMode, MODE_KEY, parseMode, saveMode } from "../mode";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("knight:mode storage", () => {
  it("has its own key", () => {
    expect(MODE_KEY).toBe("knight:mode");
  });

  it("defaults to hand on a coarse pointer and to code on a desktop one", () => {
    expect(defaultMode(true)).toBe("hand");
    expect(defaultMode(false)).toBe("code");
  });

  it("writes exactly this JSON (the pinned stored shape)", () => {
    saveMode("hand");
    expect(window.localStorage.getItem("knight:mode")).toBe('{"v":1,"mode":"hand"}');
    saveMode("code");
    expect(window.localStorage.getItem("knight:mode")).toBe('{"v":1,"mode":"code"}');
  });

  it("round-trips a saved choice over either default", () => {
    saveMode("code");
    expect(loadMode(true)).toBe("code");
    saveMode("hand");
    expect(loadMode(false)).toBe("hand");
  });

  it("reads the pointer default when nothing is stored or storage is blocked", () => {
    expect(loadMode(true)).toBe("hand");
    expect(loadMode(false)).toBe("code");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(loadMode(true)).toBe("hand");
  });

  it("reads malformed storage as the default", () => {
    for (const text of [
      "not json",
      "null",
      "[]",
      '{"v":1}',
      '{"v":1,"mode":"fly"}',
      '{"mode":"hand"}',
    ]) {
      window.localStorage.setItem(MODE_KEY, text);
      expect(loadMode(false)).toBe("code");
      expect(loadMode(true)).toBe("hand");
    }
  });

  it("leaves a record a newer build wrote alone", () => {
    window.localStorage.setItem(MODE_KEY, '{"v":2,"mode":"code","future":true}');
    saveMode("hand");
    expect(window.localStorage.getItem(MODE_KEY)).toBe('{"v":2,"mode":"code","future":true}');
  });

  it("survives a refused write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => saveMode("hand")).not.toThrow();
  });
});

describe("parseMode", () => {
  it("accepts only the two modes at version 1", () => {
    expect(parseMode({ v: 1, mode: "hand" })).toBe("hand");
    expect(parseMode({ v: 1, mode: "code" })).toBe("code");
    for (const bad of [null, undefined, 7, "hand", [], { v: 2, mode: "hand" }, { v: 1, mode: 1 }]) {
      expect(parseMode(bad)).toBeNull();
    }
  });
});
