import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTowerLoop } from "../use-tower-loop";

let frames = new Map<number, FrameRequestCallback>();
let nextId = 1;
let observers: { cb: IntersectionObserverCallback; disconnected: boolean }[] = [];

function pump(at: number) {
  const pending = [...frames.entries()];
  frames = new Map();
  for (const [, cb] of pending) cb(at);
}

function Harness(props: {
  active: boolean;
  frame: (now: number, dt: number) => void;
  onPause: () => void;
}) {
  const { targetRef } = useTowerLoop(props);
  return <div ref={targetRef} data-testid="stage" />;
}

function mount(over: Partial<React.ComponentProps<typeof Harness>> = {}) {
  const frame = vi.fn();
  const onPause = vi.fn();
  const view = render(<Harness active frame={frame} onPause={onPause} {...over} />);
  return { frame, onPause, view };
}

beforeEach(() => {
  frames = new Map();
  nextId = 1;
  observers = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      entry: { cb: IntersectionObserverCallback; disconnected: boolean };
      constructor(cb: IntersectionObserverCallback) {
        this.entry = { cb, disconnected: false };
        observers.push(this.entry);
      }
      observe() {}
      unobserve() {}
      disconnect() {
        this.entry.disconnected = true;
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useTowerLoop", () => {
  it("paints one frame per animation frame, with the elapsed time", () => {
    const { frame } = mount();
    act(() => pump(100));
    expect(frame).toHaveBeenCalledTimes(1);
    act(() => pump(116));
    expect(frame).toHaveBeenCalledTimes(2);
    expect(frame.mock.calls[1]?.[1]).toBeCloseTo(16, 5);
  });

  it("runs no loop while inactive", () => {
    const { frame } = mount({ active: false });
    act(() => pump(100));
    expect(frame).not.toHaveBeenCalled();
  });

  it("pauses when the tab is hidden and does not resume by itself", () => {
    const { onPause } = mount();
    act(() => setVisibility("hidden"));
    expect(onPause).toHaveBeenCalledTimes(1);
    act(() => setVisibility("visible"));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it("pauses on window blur", () => {
    const { onPause } = mount();
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it("pauses when less than 35% of the stage is visible", () => {
    const { onPause } = mount();
    const observer = observers[0];
    if (!observer) throw new Error("no observer");
    act(() => {
      observer.cb(
        [{ intersectionRatio: 0.5 } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(onPause).not.toHaveBeenCalled();
    act(() => {
      observer.cb(
        [{ intersectionRatio: 0.2 } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it("skips the visibility rule when there is no IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { frame } = mount();
    act(() => pump(10));
    expect(frame).toHaveBeenCalledTimes(1);
  });

  it("reports a thrown frame once and stops the loop", () => {
    const reportSpy = vi.fn();
    vi.stubGlobal("reportError", reportSpy);
    const frame = vi.fn(() => {
      throw new Error("boom");
    });
    mount({ frame });
    act(() => pump(10));
    expect(reportSpy).toHaveBeenCalledTimes(1);
    expect(String(reportSpy.mock.calls[0]?.[0])).toContain("tower-stacker");
    act(() => pump(26));
    expect(frame).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it("cancels its frame and observer on unmount", () => {
    const { view } = mount();
    expect(frames.size).toBe(1);
    view.unmount();
    expect(frames.size).toBe(0);
    expect(observers.every((o) => o.disconnected)).toBe(true);
  });
});
