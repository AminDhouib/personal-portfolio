import { StrictMode } from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useCountdown } from "../use-countdown";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useCountdown", () => {
  it("chimes once per step (the tap, then 2 and 1) and launches once, even under StrictMode", () => {
    vi.useFakeTimers();
    const onChime = vi.fn();
    const onLaunch = vi.fn();
    const { result } = renderHook(() => useCountdown(onChime, onLaunch), { wrapper: StrictMode });
    act(() => result.current.begin());
    expect(result.current.step).toBe(3);
    expect(onChime).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(result.current.step).toBe(2);
    expect(onChime).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.step).toBe(1);
    expect(onChime).toHaveBeenCalledTimes(3);
    expect(onLaunch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.step).toBeNull();
    expect(onChime).toHaveBeenCalledTimes(3);
    expect(onLaunch).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });

  it("cancel stops the count with no further chime or launch", () => {
    vi.useFakeTimers();
    const onChime = vi.fn();
    const onLaunch = vi.fn();
    const { result } = renderHook(() => useCountdown(onChime, onLaunch));
    act(() => result.current.begin());
    act(() => result.current.cancel());
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.step).toBeNull();
    expect(onChime).toHaveBeenCalledTimes(1);
    expect(onLaunch).not.toHaveBeenCalled();
  });
});
