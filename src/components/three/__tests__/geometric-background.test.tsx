import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

// jsdom has no WebGL, so the Canvas stands in as a plain element that exposes
// the frame loop it was given. Its children (the shapes) need a real renderer
// and are not rendered here.
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ frameloop }: { frameloop?: string }) => (
    <div data-testid="canvas" data-frameloop={frameloop ?? "always"} />
  ),
  useFrame: vi.fn(),
  useThree: vi.fn(),
}));

import { GeometricBackground } from "../geometric-background";

const REDUCE = "(prefers-reduced-motion: reduce)";

/** A controllable prefers-reduced-motion media query; jsdom has no matchMedia. */
function stubReducedMotion(initial: boolean) {
  let reduce = initial;
  const listeners = new Set<() => void>();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === REDUCE && reduce;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
  return {
    set(next: boolean) {
      reduce = next;
      act(() => listeners.forEach((listener) => listener()));
    },
    listenerCount: () => listeners.size,
  };
}

const frameloop = () => screen.getByTestId("canvas").getAttribute("data-frameloop");

describe("GeometricBackground", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("animates every frame when the visitor has not asked for reduced motion", () => {
    stubReducedMotion(false);
    render(<GeometricBackground />);
    expect(frameloop()).toBe("always");
  });

  it("draws a still frame, rendering on demand only, under prefers-reduced-motion", () => {
    stubReducedMotion(true);
    render(<GeometricBackground />);
    expect(frameloop()).toBe("demand");
  });

  it("follows a change to the OS setting without a reload", () => {
    const media = stubReducedMotion(false);
    render(<GeometricBackground />);
    media.set(true);
    expect(frameloop()).toBe("demand");
    media.set(false);
    expect(frameloop()).toBe("always");
  });

  it("stops listening for the setting once unmounted", () => {
    const media = stubReducedMotion(false);
    const { unmount } = render(<GeometricBackground />);
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });
});
