import { act, cleanup, fireEvent } from "@testing-library/react";
import { vi } from "vitest";

// The jsdom harness for tests that render the real Hextris shell over the real engine: a canvas
// context that draws nothing, animation frames the test runs by hand on a fake 16 ms clock, and
// stubs for ResizeObserver, matchMedia and fetch (the board read never answers). Each test file
// keeps its own vi.mock of the engine's drainEvents, since vi.mock only hoists inside a test file.

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
export function runFrames(n: number) {
  for (let i = 0; i < n; i++) {
    clock += 16;
    const pending = [...frames.values()];
    frames = new Map();
    act(() => {
      for (const cb of pending) cb(clock);
    });
  }
}

/** For beforeEach. */
export function installShellStubs() {
  frames = new Map();
  nextFrame = 1;
  clock = 1000;
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
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
}

/** For afterEach. */
export function removeShellStubs() {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", realGetContext);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}

export function shellCanvas(container: HTMLElement): HTMLCanvasElement {
  const canvas = container.querySelector("canvas");
  if (!canvas) throw new Error("no canvas");
  return canvas;
}

/** Clicks the board to start a run (into the countdown) and runs one frame. */
export function startRun(container: HTMLElement) {
  fireEvent.click(shellCanvas(container));
  runFrames(1);
}

/** The fetch calls that were POSTs (the arcade submission). */
export function postCalls() {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => (init?.method ?? "GET").toUpperCase() === "POST");
}
