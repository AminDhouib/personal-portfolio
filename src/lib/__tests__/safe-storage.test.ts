import { describe, it, expect, vi, afterEach } from "vitest";
import { asNumberArray, safeLocalSet } from "@/lib/safe-storage";

describe("asNumberArray", () => {
  it("passes through an array of numbers", () => {
    expect(asNumberArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("filters a mixed array down to just the numbers", () => {
    expect(asNumberArray([1, "a", 3])).toEqual([1, 3]);
  });

  it("returns [] for a plain object", () => {
    expect(asNumberArray({})).toEqual([]);
  });

  it("returns [] for a number", () => {
    expect(asNumberArray(5)).toEqual([]);
  });

  it("returns [] for null", () => {
    expect(asNumberArray(null)).toEqual([]);
  });

  it("returns [] for undefined", () => {
    expect(asNumberArray(undefined)).toEqual([]);
  });

  it("returns [] for a string", () => {
    expect(asNumberArray("1,2,3")).toEqual([]);
  });
});

describe("safeLocalSet", () => {
  afterEach(() => {
    // Restore the real window FIRST: clearing storage or restoring mocks
    // while a test has stubbed `window` to undefined would itself throw.
    vi.unstubAllGlobals();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("writes through when storage works", () => {
    expect(safeLocalSet("p5-test-key", "v")).toBe(true);
    expect(window.localStorage.getItem("p5-test-key")).toBe("v");
  });

  it("returns false and does not throw when setItem throws", () => {
    // Spy on Storage.prototype, not the window.localStorage instance:
    // jsdom's Storage object does not let an own-property override on the
    // instance shadow the method actually invoked by `.setItem(...)`.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => safeLocalSet("p5-test-key", "v")).not.toThrow();
    expect(safeLocalSet("p5-test-key", "v")).toBe(false);
  });

  it("does not throw when window is unavailable (SSR/absent window)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => safeLocalSet("p5-test-key", "v")).not.toThrow();
    expect(safeLocalSet("p5-test-key", "v")).toBe(false);
  });
});
