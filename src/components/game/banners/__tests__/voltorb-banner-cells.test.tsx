import { act, cleanup, render } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Replace framer-motion's tags with plain elements that expose `transition` as JSON, so the test
// reads the flip delay each cell was given.
vi.mock("framer-motion", () => {
  const tag = (name: string) => {
    const Component = ({
      children,
      transition,
      className,
    }: {
      children?: ReactNode;
      transition?: unknown;
      className?: string;
    }) =>
      createElement(
        name,
        {
          className,
          "data-transition": transition === undefined ? undefined : JSON.stringify(transition),
        },
        children,
      );
    return Component;
  };
  return {
    motion: new Proxy({}, { get: (_t, name: string) => tag(name) }),
    useMotionValue: () => ({ on: () => () => {} }),
    useReducedMotion: () => null,
    animate: () => ({ stop: () => {} }),
  };
});

import { SuperVoltorbFlipBanner } from "../../banners";

// The Super Voltorb Flip banner board (6 x 3 cells). The first render is seeded from the cell's
// coordinates so the server and the client agree; after mount each cell re-rolls its flip delay
// and its face from Math.random, and then re-rolls the face at every flip cycle.
const CELLS = 18;
const FLIP_CYCLE_S = 6;

const delays = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>("[data-transition]")).map(
    (el) => (JSON.parse(el.dataset.transition ?? "{}") as { delay: number }).delay,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Voltorb banner cells", () => {
  it("renders the server markup from the coordinates alone, never from Math.random", () => {
    const random = vi.spyOn(Math, "random");
    const first = renderToString(<SuperVoltorbFlipBanner />);
    const second = renderToString(<SuperVoltorbFlipBanner />);
    expect(random).not.toHaveBeenCalled();
    expect(second).toBe(first);
  });

  it("re-rolls every cell's flip delay and face from Math.random once mounted", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { container } = render(<SuperVoltorbFlipBanner />);
    expect(delays(container)).toEqual(
      Array.from({ length: CELLS }, () => 0.5 * (FLIP_CYCLE_S - 1.5)),
    );
    // 0.5 is not a bomb (>= 0.15) and 1 + floor(0.5 * 3) is a 2.
    expect(container.textContent).toBe("2".repeat(CELLS));
  });

  it("rolls each cell on its own, not one roll for the board", () => {
    let n = 0;
    vi.spyOn(Math, "random").mockImplementation(() => (n++ * 0.137) % 1);
    const { container } = render(<SuperVoltorbFlipBanner />);
    expect(new Set(delays(container)).size).toBeGreaterThan(3);
  });

  it("keeps the rolled delay and face while the banner re-renders", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { container, rerender } = render(<SuperVoltorbFlipBanner />);
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    rerender(<SuperVoltorbFlipBanner />);
    expect(delays(container)[0]).toBe(0.5 * (FLIP_CYCLE_S - 1.5));
    expect(container.textContent).toBe("2".repeat(CELLS));
  });

  it("changes the face at the first cycle boundary and then every cycle", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { container } = render(<SuperVoltorbFlipBanner />);
    const first = (0.5 * (FLIP_CYCLE_S - 1.5) + FLIP_CYCLE_S) * 1000;
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    act(() => {
      vi.advanceTimersByTime(first - 1);
    });
    expect(container.textContent).toBe("2".repeat(CELLS));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    // 0.99 is not a bomb and 1 + floor(0.99 * 3) is a 3.
    expect(container.textContent).toBe("3".repeat(CELLS));
    vi.spyOn(Math, "random").mockReturnValue(0.3);
    act(() => {
      vi.advanceTimersByTime(FLIP_CYCLE_S * 1000);
    });
    expect(container.textContent).toBe("1".repeat(CELLS));
  });

  it("hydrates the server markup without a mismatch, then rolls", async () => {
    const html = renderToString(<SuperVoltorbFlipBanner />);
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(host, <SuperVoltorbFlipBanner />);
    });
    expect(errors).not.toHaveBeenCalled();
    expect(delays(host)).toEqual(Array.from({ length: CELLS }, () => 0.5 * (FLIP_CYCLE_S - 1.5)));
    expect(host.textContent).toBe("2".repeat(CELLS));
    act(() => root?.unmount());
    host.remove();
  });
});
