import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";

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
import { VoltorbFlip, cloneGame, indexToCoordinate } from "../engine";

// The board's face-down / revealed look follows the engine's cells: a new game object (every
// engine update clones it) re-reads which cells are flipped, and a restored Daily board shows
// every cell revealed. Rendered on its own, with the audio and effects stubbed.
afterEach(cleanup);

const noop = () => {};
const tiles = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>("[data-cell]"));
const revealed = (root: HTMLElement) =>
  tiles(root).filter((el) => el.getAttribute("aria-label")?.includes("revealed")).length;

function board(game: VoltorbFlip, daily?: { restored: boolean }) {
  return (
    <Gameboard
      game={game}
      updateGame={noop}
      waitForClick
      muted
      onFirstInteraction={noop}
      memoFlags={new Set()}
      daily={daily && { restored: daily.restored, idleLine: "", onFlipped: noop, onFinished: noop }}
    />
  );
}

function safeCell(game: VoltorbFlip): [number, number] {
  const index = game.cells.flat().findIndex((cell) => cell.value !== "V");
  return indexToCoordinate(index, 5);
}

describe("Gameboard flipped cards", () => {
  it("starts with every tile face down", () => {
    const { container } = render(board(new VoltorbFlip(5)));
    expect(tiles(container)).toHaveLength(25);
    expect(revealed(container)).toBe(0);
  });

  it("reveals a tile when a new game object has it flipped, and only that tile", () => {
    const first = new VoltorbFlip(5);
    const { container, rerender } = render(board(first));
    const next = cloneGame(first);
    const [row, col] = safeCell(next);
    next.flipCell(row, col);
    rerender(board(next));
    expect(revealed(container)).toBe(1);
    expect(
      container.querySelector(`[data-cell="${row}-${col}"]`)?.getAttribute("aria-label"),
    ).toContain("revealed");
  });

  it("turns every tile face down again when the next board is dealt", () => {
    const first = new VoltorbFlip(5);
    const { container, rerender } = render(board(first));
    const played = cloneGame(first);
    const [row, col] = safeCell(played);
    played.flipCell(row, col);
    rerender(board(played));
    expect(revealed(container)).toBe(1);
    const dealt = cloneGame(played);
    dealt.restartGame();
    rerender(board(dealt));
    expect(revealed(container)).toBe(0);
  });

  it("shows a restored Daily board with every tile revealed, and follows the cells again after", () => {
    const game = new VoltorbFlip(5);
    const { container, rerender } = render(board(game, { restored: true }));
    expect(revealed(container)).toBe(25);
    rerender(board(cloneGame(game), { restored: true }));
    expect(revealed(container)).toBe(25);
    rerender(board(cloneGame(game), { restored: false }));
    expect(revealed(container)).toBe(0);
  });
});
