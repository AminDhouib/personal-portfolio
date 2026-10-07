import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSettings } from "../use-settings";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useSettings", () => {
  it("starts from storage and persists every change", () => {
    window.localStorage.setItem(
      "svf:settings",
      '{"v":1,"memoUndo":false,"stats":true,"assist":false}',
    );
    const { result } = renderHook(() => useSettings());
    expect(result.current[0].memoUndo).toBe(false);
    act(() => result.current[1]({ assist: true }));
    expect(result.current[0]).toEqual({ memoUndo: false, stats: true, assist: true });
    expect(window.localStorage.getItem("svf:settings")).toBe(
      '{"v":1,"memoUndo":false,"stats":true,"assist":true}',
    );
  });

  it("merges a partial update into the current settings", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current[1]({ stats: false }));
    act(() => result.current[1]({ memoUndo: false }));
    expect(result.current[0]).toEqual({ memoUndo: false, stats: false, assist: false });
  });
});
