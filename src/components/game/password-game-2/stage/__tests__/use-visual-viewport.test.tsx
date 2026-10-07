import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVisualViewport } from "../use-visual-viewport";

function fakeVV(height: number, width = 390) {
  const vv = Object.assign(new EventTarget(), { height, offsetTop: 0, width });
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  return vv;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "visualViewport");
});

describe("useVisualViewport", () => {
  it("reports keyboardOpen when the visual viewport shrinks, and recovers", () => {
    const vv = fakeVV(844);
    const { result } = renderHook(() => useVisualViewport(true));
    expect(result.current.keyboardOpen).toBe(false);
    act(() => {
      vv.height = 500;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toMatchObject({ keyboardOpen: true, height: 500 });
    act(() => {
      vv.height = 844;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(result.current.keyboardOpen).toBe(false);
  });

  it("follows the visual viewport offset on scroll", () => {
    const vv = fakeVV(844);
    const { result } = renderHook(() => useVisualViewport(true));
    act(() => {
      vv.height = 500;
      vv.offsetTop = 120;
      vv.dispatchEvent(new Event("scroll"));
    });
    expect(result.current).toMatchObject({ keyboardOpen: true, height: 500, top: 120 });
  });

  it("a rotation resets the baseline, so a shorter landscape viewport is not a keyboard", () => {
    const vv = fakeVV(844, 390);
    const { result } = renderHook(() => useVisualViewport(true));
    act(() => {
      vi.stubGlobal("innerHeight", 390); // the layout viewport rotates too
      vv.height = 390;
      vv.width = 844;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(result.current.keyboardOpen).toBe(false);
  });

  it("is inert when visualViewport is unsupported", () => {
    const { result } = renderHook(() => useVisualViewport(true));
    expect(result.current.keyboardOpen).toBe(false);
  });

  it("is inert and attaches nothing when disabled", () => {
    const vv = fakeVV(844);
    const add = vi.spyOn(vv, "addEventListener");
    const { result } = renderHook(() => useVisualViewport(false));
    expect(result.current.keyboardOpen).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it("removes its listeners on unmount", () => {
    const vv = fakeVV(844);
    const add = vi.spyOn(vv, "addEventListener");
    const remove = vi.spyOn(vv, "removeEventListener");
    const { unmount } = renderHook(() => useVisualViewport(true));
    expect(add.mock.calls.length).toBeGreaterThan(0);
    unmount();
    expect(remove).toHaveBeenCalledTimes(add.mock.calls.length);
  });
});
