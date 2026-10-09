import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineEvent } from "../engine/types";
import { TIPS_KEY } from "../tips";
import {
  installShellStubs,
  postCalls,
  removeShellStubs,
  runFrames,
  startRun,
} from "./shell-harness";

// The shell's controls must be thumb-sized on a phone (44 px, h-11) and the name field 16 px so
// iOS does not zoom on focus. The real engine runs; events the test needs sooner than play would
// bring them (a full meter, game over) are slipped into the shell's next drain.
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

function expectThumbSized(el: HTMLElement) {
  expect(el.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-11", "w-11"]));
}

describe("Hextris HUD sizing", () => {
  it("makes Pause, Sound and Fullscreen 44 px squares", () => {
    const { container } = render(<HextrisGame />);
    expectThumbSized(screen.getByRole("button", { name: "Mute" }));
    expectThumbSized(screen.getByRole("button", { name: /fullscreen/ }));
    startRun(container);
    expectThumbSized(screen.getByRole("button", { name: "Pause" }));
  });

  it("gives Panic Clear at least a 44 px height", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    injected.push({ type: "momentum", value: 100 });
    runFrames(1);
    const panic = screen.getByRole("button", { name: "Panic Clear" });
    expect(panic.className.split(/\s+/)).toContain("min-h-11");
  });

  it("sets the name field at 16 px on phones and its row at 44 px", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    injected.push({ type: "game-over", side: 0, score: 120, cellsCleared: 12 });
    runFrames(1);
    const name = screen.getByPlaceholderText("Your name");
    const classes = name.className.split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining(["text-base", "sm:pointer-fine:text-sm", "min-h-11"]),
    );
    expect(classes).not.toContain("text-sm");
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit.className.split(/\s+/)).toContain("min-h-11");
  });
});

describe("Hextris Panic Clear tip", () => {
  const TIP = "Press F or tap to clear the board";

  function fillMeter() {
    injected.push({ type: "momentum", value: 100 });
    runFrames(1);
  }

  function spendMeter() {
    injected.push({ type: "momentum", value: 0 });
    runFrames(1);
  }

  it("shows above Panic Clear the first time the meter fills, and goes once it is used", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    expect(screen.queryByText(TIP)).toBeNull();
    fillMeter();
    expect(screen.getByRole("status")).toHaveTextContent(TIP);
    expect(window.localStorage.getItem(TIPS_KEY)).toBe('{"v":1,"panicSeen":true}');
    spendMeter();
    expect(screen.queryByText(TIP)).toBeNull();
    // Never twice on one page, even if the stored flag could not be written.
    window.localStorage.clear();
    fillMeter();
    expect(screen.getByRole("button", { name: "Panic Clear" })).toBeInTheDocument();
    expect(screen.queryByText(TIP)).toBeNull();
  });

  it("goes by itself after 6 s", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container } = render(<HextrisGame />);
    startRun(container);
    fillMeter();
    expect(screen.getByText(TIP)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5900);
    });
    expect(screen.getByText(TIP)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText(TIP)).toBeNull();
    expect(screen.getByRole("button", { name: "Panic Clear" })).toBeInTheDocument();
  });

  it("never shows again once seen (a reload)", () => {
    window.localStorage.setItem(TIPS_KEY, '{"v":1,"panicSeen":true}');
    const { container } = render(<HextrisGame />);
    startRun(container);
    fillMeter();
    expect(screen.getByRole("button", { name: "Panic Clear" })).toBeInTheDocument();
    expect(screen.queryByText(TIP)).toBeNull();
  });
});

describe("Hextris canvas sizing", () => {
  it("reallocates the canvas backing store only when its size changes", () => {
    let size = { width: 390, height: 600 };
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          ...size,
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: size.width,
          bottom: size.height,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    const setWidth = vi.spyOn(HTMLCanvasElement.prototype, "width", "set");
    render(<HextrisGame />);
    expect(setWidth).toHaveBeenCalledTimes(1);
    // The same size reported again, as resize, orientation and fullscreen callbacks do.
    for (let i = 0; i < 3; i++) window.dispatchEvent(new Event("resize"));
    runFrames(1);
    expect(setWidth).toHaveBeenCalledTimes(1);
    size = { width: 360, height: 600 };
    window.dispatchEvent(new Event("resize"));
    runFrames(1);
    expect(setWidth).toHaveBeenCalledTimes(2);
  });
});

describe("Hextris away hint", () => {
  const AWAY = "Away: clears score 0 until you move";

  it("shows quietly once play has gone 8 s without input, and goes on the next input", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    // The 2.4 s countdown, then not quite 8 s of play.
    runFrames(Math.ceil((2400 + 7900) / 16));
    expect(screen.queryByText(AWAY)).toBeNull();
    runFrames(20);
    expect(screen.getByText(AWAY)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    runFrames(1);
    expect(screen.queryByText(AWAY)).toBeNull();
  });
});

describe("Hextris tutorial overlay", () => {
  function tutorialClose() {
    return screen.queryByRole("button", { name: "Dismiss tutorial" });
  }

  it("lets a tap on the board through during the countdown, which rotates and hides it", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    const close = tutorialClose();
    if (!close) throw new Error("no tutorial");
    // jsdom does no hit testing, so pin the layering: the board-sized layer takes no pointer
    // events, and only the close control (a 44 px target, not the whole board) does.
    const classes = close.className.split(/\s+/);
    expect(classes).not.toContain("inset-0");
    expect(classes).toEqual(expect.arrayContaining(["pointer-events-auto", "h-11", "w-11"]));
    const layer = close.closest(".inset-0");
    expect(layer?.className.split(/\s+/)).toContain("pointer-events-none");
    const canvas = container.querySelector("canvas");
    if (!canvas) throw new Error("no canvas");
    fireEvent.click(canvas);
    runFrames(1);
    expect(tutorialClose()).toBeNull();
  });

  it("still closes from its close control", () => {
    const { container } = render(<HextrisGame />);
    startRun(container);
    const close = tutorialClose();
    if (!close) throw new Error("no tutorial");
    fireEvent.click(close);
    expect(tutorialClose()).toBeNull();
  });
});

describe("Hextris game-over card at 0", () => {
  it("offers no submit for a score of 0 and never posts it", () => {
    // A name is already saved, as it would be for a returning player.
    window.localStorage.setItem("hextris_name", "Idle");
    const { container } = render(<HextrisGame />);
    startRun(container);
    injected.push({ type: "game-over", side: 0, score: 0, cellsCleared: 3 });
    runFrames(1);
    expect(screen.getByText("No score to post")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Your name")).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(postCalls()).toHaveLength(0);
  });
});
