import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMemoUndo } from "../use-memo-undo";
import { VoltorbFlip } from "../engine";

describe("useMemoUndo", () => {
  it("records changes and undoes the newest one through updateGame", () => {
    const { result } = renderHook(() => useMemoUndo());
    const game = new VoltorbFlip(5);
    const applied: Array<[number, number, string | number]> = [];
    const updateGame = vi.fn((cb: (g: VoltorbFlip) => void) => {
      const fake = {
        flagCell: (r: number, c: number, f: string | number) => applied.push([r, c, f]),
      } as unknown as VoltorbFlip;
      cb(fake);
    });
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.record({ row: 0, col: 1, flag: 2 }));
    act(() => result.current.record({ row: 3, col: 3, flag: "V" }));
    expect(result.current.canUndo).toBe(true);
    let did = false;
    act(() => {
      did = result.current.undo(game, updateGame);
    });
    expect(did).toBe(true);
    expect(applied).toEqual([[3, 3, "V"]]);
    act(() => {
      result.current.undo(game, updateGame);
    });
    expect(applied).toEqual([
      [3, 3, "V"],
      [0, 1, 2],
    ]);
    expect(result.current.canUndo).toBe(false);
  });

  it("undo with nothing to undo returns false and does not call updateGame", () => {
    const { result } = renderHook(() => useMemoUndo());
    const updateGame = vi.fn();
    let did = true;
    act(() => {
      did = result.current.undo(new VoltorbFlip(5), updateGame);
    });
    expect(did).toBe(false);
    expect(updateGame).not.toHaveBeenCalled();
  });

  it("reset empties the stack", () => {
    const { result } = renderHook(() => useMemoUndo());
    act(() => result.current.record({ row: 0, col: 0, flag: 1 }));
    act(() => result.current.reset());
    expect(result.current.canUndo).toBe(false);
  });
});
