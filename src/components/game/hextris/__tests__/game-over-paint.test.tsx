import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineEvent } from "../engine/types";
import type { PaintEnding } from "../render/paint";
import { installShellStubs, removeShellStubs, runFrames, startRun } from "./shell-harness";

// What the shell hands the painter after a game over. The game over is slipped into the shell's
// next drain (and the run put in the over phase), and paint is a spy that keeps its last ending.
const injected = vi.hoisted(() => [] as EngineEvent[]);
const painted = vi.hoisted(() => ({ calls: 0, ending: undefined as unknown }));

vi.mock("../engine/state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/state")>();
  return {
    ...actual,
    drainEvents: (run: Parameters<typeof actual.drainEvents>[0]) => {
      const extra = injected.splice(0);
      if (extra.some((event) => event.type === "game-over")) run.phase = "over";
      return [...actual.drainEvents(run), ...extra];
    },
  };
});

vi.mock("../render/paint", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../render/paint")>();
  return {
    ...actual,
    paint: (...args: Parameters<typeof actual.paint>) => {
      painted.calls += 1;
      painted.ending = args[5];
    },
  };
});

import { HextrisGame } from "../../hextris";

const lastEnding = () => painted.ending as PaintEnding | undefined;

function reduceMotion() {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  );
}

function endRun(score: number, side = 2) {
  injected.push({ type: "game-over", side, score, cellsCleared: 12 });
  runFrames(1);
}

beforeEach(() => {
  injected.length = 0;
  painted.calls = 0;
  painted.ending = undefined;
  window.localStorage.clear();
  installShellStubs();
});

afterEach(() => {
  removeShellStubs();
});

describe("Hextris game over on the board", () => {
  it("paints no ending during a run", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    runFrames(5);
    expect(painted.calls).toBeGreaterThan(0);
    expect(lastEnding()).toBeUndefined();
  });

  it("hands the painter the overflowed side and a new best, timed from the end", () => {
    window.localStorage.setItem("hextris_highscores", "[100]");
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120, 4);
    expect(lastEnding()).toEqual({ side: 4, newBest: true, sinceMs: 0 });
    runFrames(10);
    expect(lastEnding()).toEqual({ side: 4, newBest: true, sinceMs: 160 });
  });

  it("keeps painting under the card, past the burst, so the side keeps pulsing", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    const before = painted.calls;
    runFrames(100);
    expect(painted.calls - before).toBe(100);
    expect(lastEnding()?.sinceMs).toBe(1600);
  });

  it("does not burst on the first run ever", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    expect(lastEnding()).toEqual({ side: 2, newBest: false, sinceMs: 0 });
  });

  it("under reduced motion, holds the highlight still and skips the burst", () => {
    reduceMotion();
    window.localStorage.setItem("hextris_highscores", "[100]");
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120, 1);
    runFrames(30);
    expect(lastEnding()).toEqual({ side: 1, newBest: false, sinceMs: 0 });
  });

  it("drops the ending when the next run starts", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    runFrames(1);
    expect(lastEnding()).toBeUndefined();
  });
});
