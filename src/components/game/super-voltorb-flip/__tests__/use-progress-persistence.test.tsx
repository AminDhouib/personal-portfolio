import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGame } from "../use-game";
import { useProgressPersistence } from "../use-progress-persistence";

// The saved level, total and history (svf:progress): restored once after mount, written back on
// every change, and never overwritten by the first render's defaults. Real useGame, real storage.
function setup(raise: (level: number) => void = () => {}) {
  return renderHook(() => {
    const { game, updateGame } = useGame();
    const hydrated = useProgressPersistence(game, updateGame, raise);
    return { game, hydrated };
  });
}

const writes: string[] = [];

beforeEach(() => {
  window.localStorage.clear();
  writes.length = 0;
  const real = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (key === "svf:progress") writes.push(value);
    real.call(this, key, value);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("useProgressPersistence", () => {
  it("is hydrated after mount with no save, and then writes the defaults", () => {
    const { result } = setup();
    expect(result.current.hydrated).toBe(true);
    expect(result.current.game.currentLevel).toBe(1);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!)).toMatchObject({ currentLevel: 1, totalScore: 0 });
  });

  it("restores a save, tells the statistics, and never writes the defaults over it", () => {
    window.localStorage.setItem(
      "svf:progress",
      JSON.stringify({ currentLevel: 4, totalScore: 1234 }),
    );
    writes.length = 0;
    const raise = vi.fn();
    const { result } = setup(raise);
    expect(result.current.hydrated).toBe(true);
    expect(result.current.game.currentLevel).toBe(4);
    expect(result.current.game.totalScore).toBe(1234);
    expect(raise).toHaveBeenCalledTimes(1);
    expect(raise).toHaveBeenCalledWith(4);
    expect(writes.length).toBeGreaterThan(0);
    for (const written of writes) {
      expect(JSON.parse(written)).toMatchObject({ currentLevel: 4, totalScore: 1234 });
    }
  });
});
