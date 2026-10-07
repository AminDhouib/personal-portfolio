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
});
