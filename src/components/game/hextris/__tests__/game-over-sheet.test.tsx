import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineEvent } from "../engine/types";
import {
  installShellStubs,
  removeShellStubs,
  runFrames,
  shellCanvas,
  startRun,
} from "./shell-harness";

// The game-over sheet over the real shell and engine. The game over itself is slipped into the
// shell's next drain, so a test reaches the sheet without playing a run out.
const injected = vi.hoisted(() => [] as EngineEvent[]);

vi.mock("../engine/state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/state")>();
  return {
    ...actual,
    drainEvents: (run: Parameters<typeof actual.drainEvents>[0]) => [
      ...actual.drainEvents(run),
      ...injected.splice(0),
    ],
  };
});

import { HextrisGame } from "../../hextris";

beforeEach(() => {
  injected.length = 0;
  window.localStorage.clear();
  installShellStubs();
});

afterEach(() => {
  removeShellStubs();
});

function endRun(score: number, side = 2) {
  injected.push({ type: "game-over", side, score, cellsCleared: 12 });
  runFrames(1);
}

const classesOf = (el: Element) => el.className.toString().split(/\s+/);

describe("Hextris game over keeps the board visible", () => {
  it("shows the sheet beside or under the board, never over all of it", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    const sheet = screen.getByRole("region", { name: "Game over" });
    const canvas = shellCanvas(container);
    // No layer between the sheet and the game's frame (the canvas's parent) covers the board.
    const frame = canvas.parentElement;
    for (let el: Element | null = sheet; el && el !== frame; el = el.parentElement) {
      expect(classesOf(el)).not.toContain("inset-0");
    }
    expect(sheet.parentElement).toBe(frame);
    expect(classesOf(sheet)).toEqual(expect.arrayContaining(["bottom-0", "sm:w-80"]));
    expect(canvas).toBeInTheDocument();
    expect(canvas).toBeVisible();
  });

  it("collapses to a strip with Hide and comes back with Show", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    expect(screen.getByPlaceholderText("Your name")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByPlaceholderText("Your name")).toBeNull();
    // The strip keeps the score and Play again in view.
    expect(screen.getByRole("region", { name: "Game over" })).toHaveTextContent("120");
    expect(screen.getByRole("button", { name: "Play again" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByPlaceholderText("Your name")).toBeInTheDocument();
  });

  it("opens the next game over expanded", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    runFrames(1);
    expect(screen.queryByRole("region", { name: "Game over" })).toBeNull();
    endRun(80);
    expect(screen.getByPlaceholderText("Your name")).toBeInTheDocument();
  });
});
