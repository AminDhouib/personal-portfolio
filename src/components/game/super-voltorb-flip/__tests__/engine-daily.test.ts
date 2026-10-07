import { describe, it, expect } from "vitest";
import { VoltorbFlip, cloneGame } from "../engine";
import { dailyBoard, DAILY_LEVEL } from "../daily-board";

const board = dailyBoard("2026-10-07"); // nine 2s, ten Voltorbs, max 512
const at = (i: number) => [Math.floor(i / 5), i % 5] as const;
const indexOf = (pred: (v: unknown) => boolean) => board.layout.findIndex(pred);

describe("VoltorbFlip.daily", () => {
  it("deals exactly the day's layout at the daily level", () => {
    const game = VoltorbFlip.daily(board.boardId, board.layout, DAILY_LEVEL);
    expect(
      game.cells
        .flat()
        .map((c) => c.value)
        .join(""),
    ).toBe(board.layout.join(""));
    expect(game.currentLevel).toBe(DAILY_LEVEL);
    expect(game.gameStatus).toBe("playing");
    expect(game.currentScore).toBe(0);
    expect(game.history.every((r) => r.outcome === "none")).toBe(true);
  });

  it("clears the board by flipping every 2, paying the maximum", () => {
    const game = VoltorbFlip.daily(board.boardId, board.layout, DAILY_LEVEL);
    board.layout.forEach((v, i) => {
      if (v === 2) game.flipCell(...at(i));
    });
    expect(game.gameStatus).toBe("win");
    expect(game.currentScore).toBe(board.maxCoins);
  });

  it("ends the round on a Voltorb", () => {
    const game = VoltorbFlip.daily(board.boardId, board.layout, DAILY_LEVEL);
    game.flipCell(...at(indexOf((v) => v === "V")));
    expect(game.gameStatus).toBe("lose");
  });

  it("banks what was collected on a quit", () => {
    const game = VoltorbFlip.daily(board.boardId, board.layout, DAILY_LEVEL);
    game.flipCell(...at(indexOf((v) => v === 2)));
    game.flipCell(...at(indexOf((v) => v === 1)));
    game.quit();
    expect(game.gameStatus).toBe("quit");
    expect(game.currentScore).toBe(2);
  });

  it("replays the same flips to the same result, and survives cloneGame", () => {
    const flips = board.layout
      .map((v, i) => [v, i] as const)
      .filter(([v]) => v === 2)
      .map(([, i]) => i);
    const run = () => {
      const g = VoltorbFlip.daily(board.boardId, board.layout, DAILY_LEVEL);
      for (const i of flips) g.flipCell(...at(i));
      return g;
    };
    expect(run().currentScore).toBe(run().currentScore);
    const cloned = cloneGame(run());
    expect(cloned.gameStatus).toBe("win");
    expect(cloned.currentScore).toBe(board.maxCoins);
  });

  it("does not disturb the normal deal", () => {
    const normal = new VoltorbFlip(5);
    expect(normal.cells.flat()).toHaveLength(25);
  });
});
