import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

const { mockReducedMotion, mockStart } = vi.hoisted(() => ({
  mockReducedMotion: vi.fn<() => boolean | null>(() => false),
  mockStart: vi.fn(() => Promise.resolve()),
}));

vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return {
    ...actual,
    useReducedMotion: mockReducedMotion,
    useAnimationControls: () => ({ start: mockStart }),
    motion: {
      ...actual.motion,
      div: ({
        animate: _animate,
        ...rest
      }: React.HTMLAttributes<HTMLDivElement> & { animate?: unknown }) => <div {...rest} />,
    },
  };
});

import { HeroPhoto } from "../hero-photo";

const stateOf = (container: HTMLElement) =>
  container.querySelector("[data-state]")?.getAttribute("data-state");

describe("HeroPhoto easter egg", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReducedMotion.mockReturnValue(false);
    mockStart.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    // Drop the instance-level readyState override so the prototype getter shows through.
    Reflect.deleteProperty(document, "readyState");
  });

  it("renders a real button around the smiling photo", () => {
    render(<HeroPhoto />);
    const button = screen.getByRole("button", { name: "Poke Amin's photo" });
    expect(button).toHaveAttribute("type", "button");
    expect(screen.getByAltText("Amin Dhouib")).toBeInTheDocument();
  });

  it("does not mount the pained photo until the page has loaded", () => {
    Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
    render(<HeroPhoto />);
    expect(screen.queryByTestId("hero-photo-ouch")).toBeNull();
    act(() => {
      window.dispatchEvent(new Event("load"));
      vi.runOnlyPendingTimers();
    });
    expect(screen.getByTestId("hero-photo-ouch")).toBeInTheDocument();
  });

  it("mounts the pained photo early on hover or focus", () => {
    Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
    render(<HeroPhoto />);
    fireEvent.focus(screen.getByRole("button"));
    expect(screen.getByTestId("hero-photo-ouch")).toBeInTheDocument();
  });

  it("shakes, swaps to the pained photo mid-shake, then recovers", () => {
    const { container } = render(<HeroPhoto />);
    fireEvent.click(screen.getByRole("button"));

    expect(mockStart).toHaveBeenCalledTimes(1);
    // The swap lands inside the shake, not before it.
    expect(stateOf(container)).toBe("idle");

    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(stateOf(container)).toBe("ouch");
    expect(screen.getByRole("status")).toHaveTextContent("Ouch!");
    expect(screen.getByTestId("hero-photo-ouch")).toHaveClass("opacity-100");

    act(() => {
      vi.advanceTimersByTime(1300 - 120);
    });
    expect(stateOf(container)).toBe("idle");
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(screen.getByTestId("hero-photo-ouch")).toHaveClass("opacity-0");
  });

  it("restarts the recovery timer when poked again mid-ouch", () => {
    const { container } = render(<HeroPhoto />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(button);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // 2000 ms after the first poke, but only 1000 ms after the second.
    expect(stateOf(container)).toBe("ouch");
    expect(mockStart).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(stateOf(container)).toBe("idle");
  });

  it("skips the shake under reduced motion and swaps straight away", () => {
    mockReducedMotion.mockReturnValue(true);
    const { container } = render(<HeroPhoto />);
    fireEvent.click(screen.getByRole("button"));

    expect(mockStart).not.toHaveBeenCalled();
    expect(stateOf(container)).toBe("ouch");
    expect(screen.getByTestId("hero-photo-ouch")).toHaveClass("opacity-100");

    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(stateOf(container)).toBe("idle");
  });

  it("renders identical markup whatever the motion preference, so hydration cannot drift", () => {
    // The hook differs between server (null) and client first render (true
    // under reduced motion); React will not patch a style mismatch while
    // hydrating, so no rendered output may depend on it. Reduced-motion
    // styling lives in motion-reduce: classes instead.
    mockReducedMotion.mockReturnValue(null);
    const server = render(<HeroPhoto />).container.innerHTML;
    mockReducedMotion.mockReturnValue(true);
    const client = render(<HeroPhoto />).container.innerHTML;
    expect(client).toBe(server);
    expect(server).toContain("motion-reduce:duration-300");
    expect(server).toContain("motion-reduce:scale-100");
  });

  it("clears pending timers on unmount", () => {
    const { unmount } = render(<HeroPhoto />);
    fireEvent.click(screen.getByRole("button"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
