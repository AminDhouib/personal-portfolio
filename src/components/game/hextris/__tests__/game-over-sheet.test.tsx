import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HextrisSounds } from "../sound-manager";
import type { EngineEvent } from "../engine/types";
import {
  installShellStubs,
  postCalls,
  removeShellStubs,
  runFrames,
  shellCanvas,
  startRun,
} from "./shell-harness";

// The game-over sheet over the real shell and engine. The game over itself is slipped into the
// shell's next drain, so a test reaches the sheet without playing a run out; the run is put in
// the over phase with it, as the engine does when it emits the event.
const injected = vi.hoisted(() => [] as EngineEvent[]);

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
    // The strip keeps the score (once counted up) and Play again in view.
    runFrames(60);
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

describe("Hextris game-over name prompt", () => {
  const follows = (a: Node, b: Node) =>
    (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

  it("leads the sheet: the name field and Submit come before the stats and the board", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    const name = screen.getByPlaceholderText("Your name");
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(follows(name, screen.getByText("Max Combo"))).toBe(true);
    expect(follows(submit, screen.getByText("Max Combo"))).toBe(true);
    expect(follows(name, screen.getByText("Top Runs"))).toBe(true);
    expect(classesOf(name)).toContain("min-h-11");
    expect(classesOf(submit)).toContain("min-h-11");
  });

  it("never submits by itself, even with a saved name; Submit or Enter posts once", () => {
    window.localStorage.setItem("hextris_name", "Ada");
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    // Two seconds of frames with a name already filled in: still nothing posted.
    runFrames(125);
    expect(postCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(postCalls()).toHaveLength(1);
  });

  it("posts on Enter in the name field", () => {
    window.localStorage.setItem("hextris_name", "Ada");
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    expect(postCalls()).toHaveLength(0);
    fireEvent.keyDown(screen.getByPlaceholderText("Your name"), { key: "Enter" });
    expect(postCalls()).toHaveLength(1);
  });
});

describe("Hextris new best and count-up", () => {
  const sheet = () => screen.getByRole("region", { name: "Game over" });
  const shownScore = () => within(sheet()).getByTestId("final-score");

  it("counts the score up over about 900 ms", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(1200);
    expect(shownScore()).not.toHaveTextContent("1200");
    runFrames(28);
    const mid = Number(shownScore().textContent);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1200);
    runFrames(32);
    expect(shownScore()).toHaveTextContent(/^1200$/);
  });

  it("celebrates beating a stored best, once, with its own cue", () => {
    window.localStorage.setItem("hextris_highscores", "[100]");
    const cue = vi.spyOn(HextrisSounds.prototype, "newBest");
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    expect(within(sheet()).getByText("NEW BEST")).toBeInTheDocument();
    expect(cue).toHaveBeenCalledTimes(1);
  });

  it("does not celebrate the first run ever, a tie or a lower score", () => {
    const cue = vi.spyOn(HextrisSounds.prototype, "newBest");
    const cases: [string | null, number][] = [
      [null, 120],
      ["[120]", 120],
      ["[500]", 120],
    ];
    for (const [stored, score] of cases) {
      window.localStorage.clear();
      if (stored) window.localStorage.setItem("hextris_highscores", stored);
      const { container, unmount } = render(<HextrisGame />);
      startRun(container);
      endRun(score);
      expect(within(sheet()).queryByText("NEW BEST")).toBeNull();
      unmount();
    }
    expect(cue).not.toHaveBeenCalled();
  });
});

describe("Hextris one-tap restart", () => {
  const sheet = () => screen.queryByRole("region", { name: "Game over" });
  // Frames run 16 ms apart; the game over lands on the first frame after endRun's push.
  const framesFor = (ms: number) => Math.round(ms / 16);

  it("ignores a tap on the board for 1200 ms, then restarts on one", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    runFrames(framesFor(1000));
    fireEvent.click(shellCanvas(container));
    runFrames(1);
    expect(sheet()).not.toBeNull();
    runFrames(framesFor(300));
    fireEvent.click(shellCanvas(container));
    runFrames(1);
    expect(sheet()).toBeNull();
    // A fresh run, through the countdown.
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("restarts on Space, Enter or R after the lockout, not before", () => {
    for (const key of [" ", "Enter", "r"]) {
      const { container, unmount } = render(<HextrisGame />);
      startRun(container);
      endRun(120);
      runFrames(framesFor(1000));
      fireEvent.keyDown(window, { key });
      runFrames(1);
      expect(sheet()).not.toBeNull();
      runFrames(framesFor(500));
      fireEvent.keyDown(window, { key });
      runFrames(1);
      expect(sheet()).toBeNull();
      unmount();
    }
  });

  it("never restarts from a tap on the sheet", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    runFrames(framesFor(1500));
    const shown = sheet();
    if (!shown) throw new Error("no sheet");
    fireEvent.click(shown);
    fireEvent.click(screen.getByText("Top Runs"));
    runFrames(1);
    expect(sheet()).not.toBeNull();
  });

  it("keeps Play again working straight away", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    runFrames(1);
    expect(sheet()).toBeNull();
  });
});
