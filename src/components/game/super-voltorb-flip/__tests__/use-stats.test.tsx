import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStats } from "../use-stats";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useStats", () => {
  it("records a round and persists it", () => {
    const { result } = renderHook(() => useStats(true));
    act(() =>
      result.current.record({ outcome: "won", coins: 24, level: 2, assisted: false, seconds: 10 }),
    );
    expect(result.current.stats.rounds.won).toBe(1);
    expect(JSON.parse(window.localStorage.getItem("svf:stats") ?? "{}").coins.total).toBe(24);
  });

  it("records nothing and writes nothing while statistics are off", () => {
    const { result } = renderHook(() => useStats(false));
    act(() =>
      result.current.record({ outcome: "lost", coins: 0, level: 1, assisted: false, seconds: 5 }),
    );
    expect(result.current.stats.rounds.played).toBe(0);
    expect(window.localStorage.getItem("svf:stats")).toBeNull();
  });

  it("reset clears the stored statistics", () => {
    const { result } = renderHook(() => useStats(true));
    act(() =>
      result.current.record({ outcome: "quit", coins: 3, level: 1, assisted: false, seconds: 5 }),
    );
    act(() => result.current.reset());
    expect(result.current.stats.rounds.played).toBe(0);
    expect(JSON.parse(window.localStorage.getItem("svf:stats") ?? "{}").rounds.played).toBe(0);
  });

  it("does not write over a value stored by a newer version", () => {
    const newer = '{"v":2,"rounds":{"played":9}}';
    window.localStorage.setItem("svf:stats", newer);
    const { result } = renderHook(() => useStats(true));
    act(() =>
      result.current.record({ outcome: "won", coins: 1, level: 1, assisted: false, seconds: 1 }),
    );
    expect(window.localStorage.getItem("svf:stats")).toBe(newer);
  });

  it("raises the highest level only upward, and not while disabled", () => {
    const { result } = renderHook(() => useStats(true));
    act(() => result.current.raiseHighestLevel(5));
    expect(result.current.stats.highestLevel).toBe(5);
    act(() => result.current.raiseHighestLevel(3));
    expect(result.current.stats.highestLevel).toBe(5);
    const off = renderHook(() => useStats(false));
    act(() => off.result.current.raiseHighestLevel(7));
    expect(off.result.current.stats.highestLevel).toBe(5);
  });
});
