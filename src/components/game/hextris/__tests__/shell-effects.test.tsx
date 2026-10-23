import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineEvent } from "../engine/types";
import { installShellStubs, removeShellStubs, runFrames, startRun } from "./shell-harness";

// The shell's mount and transition effects, pinned over the real shell and engine: the touch
// detection, the first-seconds tutorial, and the per-run reset of the game-over sheet's own state
// (rank, submit button, share note). A game over is slipped into the shell's next drain, as in
// the game-over sheet suite.
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
  Reflect.deleteProperty(navigator, "maxTouchPoints");
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
  removeShellStubs();
});

function endRun(score: number) {
  injected.push({ type: "game-over", side: 2, score, cellsCleared: 12 });
  runFrames(1);
}

// jsdom answers "ontouchstart" in window with true, so the no-touch case takes the handler off
// whichever object in the chain owns it, and puts it back after.
function withoutTouchEvents() {
  for (let owner: object | null = window; owner; owner = Object.getPrototypeOf(owner)) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, "ontouchstart");
    if (!descriptor) continue;
    const holder = owner;
    Reflect.deleteProperty(holder, "ontouchstart");
    return () => Object.defineProperty(holder, "ontouchstart", descriptor);
  }
  return () => {};
}

describe("Hextris touch detection", () => {
  let restore = () => {};
  afterEach(() => restore());

  it("shows the keyboard hint on a device without touch", () => {
    restore = withoutTouchEvents();
    const { container } = render(<HextrisGame />);
    startRun(container);
    expect(screen.getByText("Rotate left")).toBeInTheDocument();
    expect(screen.queryByText("Left half")).toBeNull();
  });

  it("shows the touch hint on a device with touch points", () => {
    Object.defineProperty(navigator, "maxTouchPoints", { value: 2, configurable: true });
    const { container } = render(<HextrisGame />);
    startRun(container);
    expect(screen.getByText("Left half")).toBeInTheDocument();
    expect(screen.getByText("Right half")).toBeInTheDocument();
    expect(screen.queryByText("Rotate left")).toBeNull();
  });
});

describe("Hextris tutorial", () => {
  const TUTORIAL = "Match 3+ blocks to score";

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("is not shown on the menu", () => {
    render(<HextrisGame />);
    expect(screen.queryByText(TUTORIAL)).toBeNull();
  });

  it("shows when a run starts and goes by itself after 6.5 s", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    expect(screen.getByText(TUTORIAL)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(6400);
    });
    expect(screen.getByText(TUTORIAL)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText(TUTORIAL)).toBeNull();
  });

  it("goes on Dismiss and stays gone", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss tutorial" }));
    expect(screen.queryByText(TUTORIAL)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.queryByText(TUTORIAL)).toBeNull();
  });

  it("goes while paused and comes back, with a fresh 6.5 s, on resume", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    expect(screen.getByText(TUTORIAL)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    runFrames(1);
    expect(screen.getByText("Take a breath")).toBeInTheDocument();
    expect(screen.queryByText(TUTORIAL)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Resume" })[0]!);
    runFrames(1);
    expect(screen.queryByText("Take a breath")).toBeNull();
    expect(screen.getByText(TUTORIAL)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(6400);
    });
    expect(screen.getByText(TUTORIAL)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText(TUTORIAL)).toBeNull();
  });

  it("is not shown on the game-over sheet", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    expect(screen.getByRole("region", { name: "Game over" })).toBeInTheDocument();
    expect(screen.queryByText(TUTORIAL)).toBeNull();
  });
});

describe("Hextris game-over sheet, run to run", () => {
  function stubFetch() {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        (init?.method ?? "GET").toUpperCase() === "POST"
          ? Promise.resolve(
              new Response(
                JSON.stringify({
                  ok: true,
                  boards: [
                    { period: "all-time", board: "all-time", rank: 3, best: 120, improved: true },
                  ],
                }),
                { status: 200 },
              ),
            )
          : new Promise(() => {}),
      ),
    );
  }

  it("starts every game over with a fresh Submit button and no rank", async () => {
    stubFetch();
    window.localStorage.setItem("hextris_name", "Ada");
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled());
    expect(screen.getByText("#3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    runFrames(1);
    expect(screen.queryByRole("region", { name: "Game over" })).toBeNull();
    endRun(90);
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Saved" })).toBeNull();
    expect(screen.queryByText("#3")).toBeNull();
  });

  it("starts every game over without the last run's share note", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { container } = render(<HextrisGame />);
    startRun(container);
    endRun(120);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    runFrames(1);
    endRun(90);
    expect(screen.queryByText("Copied")).toBeNull();
  });
});
