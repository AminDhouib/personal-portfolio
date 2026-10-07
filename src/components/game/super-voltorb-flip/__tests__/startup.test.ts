import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { afterPageLoad } from "../startup";

let state: DocumentReadyState = "complete";

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, "readyState", { configurable: true, get: () => state });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, "readyState");
  state = "complete";
});

describe("afterPageLoad", () => {
  it("runs on the next task when the page has already loaded", () => {
    const cb = vi.fn();
    afterPageLoad(cb);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("waits for the load event while the page is still loading", () => {
    state = "loading";
    const cb = vi.fn();
    afterPageLoad(cb);
    vi.advanceTimersByTime(1000);
    expect(cb).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(0);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("cancelling before the load event means it never runs", () => {
    state = "loading";
    const cb = vi.fn();
    const cancel = afterPageLoad(cb);
    cancel();
    window.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(10);
    expect(cb).not.toHaveBeenCalled();
  });

  it("cancelling after it was scheduled means it never runs", () => {
    const cb = vi.fn();
    const cancel = afterPageLoad(cb);
    cancel();
    vi.advanceTimersByTime(10);
    expect(cb).not.toHaveBeenCalled();
  });
});
