import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineEvent } from "../engine/types";

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
