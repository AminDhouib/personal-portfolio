import { describe, it, expect, vi, afterEach } from "vitest";
import { StrictMode, type ReactNode } from "react";
import { renderHook, cleanup } from "@testing-library/react";
import { useUnmountTimers } from "../use-unmount-timers";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useUnmountTimers", () => {
  it("runs a scheduled callback once and forgets it", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const { result } = renderHook(() => useUnmountTimers());

    result.current.later(fn, 100);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels every pending timer on unmount", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const { result, unmount } = renderHook(() => useUnmountTimers());
    result.current.later(fn, 100);
    result.current.later(fn, 5000);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("schedules nothing after unmount and says so with -1", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const { result, unmount } = renderHook(() => useUnmountTimers());
    unmount();

    expect(result.current.later(fn, 10)).toBe(-1);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("cancels one timer early", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const { result } = renderHook(() => useUnmountTimers());
    const id = result.current.later(fn, 100);

    result.current.cancel(id);

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("sleep resolves after its delay while mounted", async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const { result } = renderHook(() => useUnmountTimers());

    void result.current.sleep(50).then(done);
    await vi.advanceTimersByTimeAsync(49);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("leaves a pending sleep unresolved on unmount, so the awaiting chain stops", async () => {
    vi.useFakeTimers();
    const resumed = vi.fn();
    const { result, unmount } = renderHook(() => useUnmountTimers());
    void result.current.sleep(50).then(resumed);

    unmount();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(resumed).not.toHaveBeenCalled();
    // A sleep started after the unmount does not resolve either, and arms nothing.
    void result.current.sleep(50).then(resumed);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(resumed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stays usable under StrictMode's mount, unmount, mount", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => useUnmountTimers(), { wrapper });

    expect(result.current.later(fn, 100)).not.toBe(-1);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
