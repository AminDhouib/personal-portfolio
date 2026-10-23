import { afterEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/font/local", () => ({
  default: () => ({ className: "mock-font", style: { fontFamily: "mock" } }),
}));
vi.mock("../audio", () => ({
  sfx: new Proxy({}, { get: () => () => Promise.resolve() }),
  playLevelWin: () => {},
}));
vi.mock("../effects/context", () => ({
  EffectsProvider: ({ children }: { children: ReactNode }) => children,
  useEffectsTheme: () => null,
}));

import { Gameboard } from "../gameboard";
import { VoltorbFlip, cloneGame } from "../engine";

// The fold-down after a round folds the board away one column at a time, 200 ms apart, then deals
// the next board. It has to follow the board's own width: `?size=N` and the debug panel make 2 to 10
// wide boards. Rendered on its own, muted, with the audio and effects stubbed.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Harness({ size }: { size: number }) {
  const [game, setGame] = useState(() => new VoltorbFlip(size));
  const updateGame = (callback: (g: VoltorbFlip) => void) =>
    setGame((prev) => {
      const next = cloneGame(prev);
      callback(next);
      return next;
    });
  return (
    <>
      <button onClick={() => updateGame((g) => g.quit())}>quit now</button>
      <Gameboard
        game={game}
        updateGame={updateGame}
        waitForClick
        muted
        onFirstInteraction={() => {}}
        memoFlags={new Set()}
      />
    </>
  );
}

const tiles = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>("[data-cell]"));
const isRevealed = (el: HTMLElement) =>
  el.getAttribute("aria-label")?.includes("revealed") === true;
// Column `col` of an N-wide board, read by the tile's own data-cell="row-col".
const column = (root: HTMLElement, col: number) =>
  tiles(root).filter((el) => el.getAttribute("data-cell")?.endsWith(`-${col}`));

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

// Quits the round, waits out the reveal (1 s), dismisses the result banner and returns with the
// board fully revealed and the fold-down about to start (it begins 100 ms after the press).
async function endRoundAndContinue(size: number): Promise<HTMLElement> {
  vi.useFakeTimers();
  const { container } = render(<Harness size={size} />);
  fireEvent.click(screen.getByText("quit now"));
  await advance(1000);
  expect(tiles(container).every(isRevealed)).toBe(true);
  fireEvent.keyDown(document.body, { key: "Enter" });
  await advance(0);
  return container;
}

describe.each([3, 5, 7])("fold-down on a %i wide board", (size) => {
  it("folds one whole column per 200 ms, left to right", async () => {
    const container = await endRoundAndContinue(size);
    // Column c folds 100 + 200 * c ms after the press; the first one takes a 0 ms timer, so it lands
    // 1 ms late. Each sample below sits just after its own column and well before the next.
    await advance(101);
    for (let col = 0; col < size; col++) {
      for (let c = 0; c < size; c++) {
        // Columns up to and including `col` have folded; the rest are still revealed.
        const folded = column(container, c).every((el) => !isRevealed(el));
        const untouched = column(container, c).every(isRevealed);
        expect(c <= col ? folded : untouched, `column ${c} after step ${col}`).toBe(true);
      }
      await advance(200);
    }
  });
});
