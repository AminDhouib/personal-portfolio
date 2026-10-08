import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineEvent } from "../engine/types";
import { TIPS_KEY } from "../tips";

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

const realGetContext =
  Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext") ?? {};
let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
let clock = 1000;

function fakeCanvasContext() {
  return new Proxy(
    {},
    {
      get: (_target, prop) => (prop === "measureText" ? () => ({ width: 10 }) : () => undefined),
      set: () => true,
    },
  );
}

/** Runs the pending animation frames `n` times, 16 ms apart. */
function runFrames(n: number) {
  for (let i = 0; i < n; i++) {
    clock += 16;
    const pending = [...frames.values()];
    frames = new Map();
    act(() => {
      for (const cb of pending) cb(clock);
    });
  }
}

beforeEach(() => {
  frames = new Map();
  nextFrame = 1;
  clock = 1000;
  injected.length = 0;
  window.localStorage.clear();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    value: () => fakeCanvasContext(),
    configurable: true,
    writable: true,
  });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  );
  // The game-over card reads the board; it never answers here.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", realGetContext);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function expectThumbSized(el: HTMLElement) {
  expect(el.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-11", "w-11"]));
}

function startRun(container: HTMLElement) {
  const canvas = container.querySelector("canvas");
  if (!canvas) throw new Error("no canvas");
  fireEvent.click(canvas);
  runFrames(1);
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
    injected.push({ type: "game-over", side: 0, score: 0, cellsCleared: 0 });
    runFrames(1);
    const name = screen.getByPlaceholderText("Your name");
    const classes = name.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["text-base", "sm:text-sm", "min-h-11"]));
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
