import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HANDLE_KEY, HANDLE_MAX, loadHandle, parseHandle, saveHandle } from "../handle";

// Pins failover:handle, the name last typed on the Daily Incident board.

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("failover:handle", () => {
  it("is its own key, capped at the 12 characters the server keeps", () => {
    expect(HANDLE_KEY).toBe("failover:handle");
    expect(HANDLE_MAX).toBe(12);
  });

  it("is empty before anything is saved", () => {
    expect(loadHandle()).toBe("");
  });

  it("writes exactly this JSON (the pinned stored shape) and round-trips", () => {
    expect(saveHandle("Grace")).toBe(true);
    expect(window.localStorage.getItem("failover:handle")).toBe('{"v":1,"handle":"Grace"}');
    expect(loadHandle()).toBe("Grace");
  });

  it("cuts a long name to the cap on the way in and on the way out", () => {
    saveHandle("abcdefghijklmnopqrst");
    expect(window.localStorage.getItem("failover:handle")).toBe('{"v":1,"handle":"abcdefghijkl"}');
    window.localStorage.setItem(
      "failover:handle",
      JSON.stringify({ v: 1, handle: "x".repeat(500) }),
    );
    expect(loadHandle()).toBe("x".repeat(12));
  });

  it("reads a v1 record and ignores extra fields", () => {
    expect(parseHandle({ v: 1, handle: "Ada", extra: true })).toBe("Ada");
  });

  it("treats malformed and hostile records as no name", () => {
    for (const raw of [
      null,
      7,
      "Ada",
      [],
      {},
      { v: 2, handle: "Ada" },
      { v: 1 },
      { v: 1, handle: 5 },
      { v: 1, handle: { toString: "x" } },
    ]) {
      expect(parseHandle(raw)).toBeNull();
    }
    window.localStorage.setItem("failover:handle", "{not json");
    expect(loadHandle()).toBe("");
    window.localStorage.setItem("failover:handle", "Ada");
    expect(loadHandle()).toBe("");
  });

  it("does not overwrite a newer build's record", () => {
    window.localStorage.setItem("failover:handle", JSON.stringify({ v: 2, handle: "Future" }));
    expect(saveHandle("Ada")).toBe(false);
    expect(window.localStorage.getItem("failover:handle")).toBe('{"v":2,"handle":"Future"}');
  });

  it("survives blocked storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(loadHandle()).toBe("");
    expect(saveHandle("Ada")).toBe(false);
  });
});
