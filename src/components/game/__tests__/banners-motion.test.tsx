import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { SpaceShooterBanner, TypingSpeedBanner } from "../banners";

// Replace framer-motion's tags with plain elements that expose the `animate`
// prop as JSON, so the test reads which properties a banner animates.
vi.mock("framer-motion", async () => {
  const tag = (name: string) => {
    const Component = ({
      children,
      animate,
      className,
    }: {
      children?: ReactNode;
      animate?: unknown;
      className?: string;
    }) =>
      createElement(
        name,
        { className, "data-animate": animate === undefined ? undefined : JSON.stringify(animate) },
        children,
      );
    return Component;
  };
  return {
    motion: new Proxy({}, { get: (_t, name: string) => tag(name) }),
    useMotionValue: () => ({ on: () => () => {} }),
    animate: () => ({ stop: () => {} }),
  };
});

function animatedKeys(container: HTMLElement): Set<string> {
  const keys = new Set<string>();
  container.querySelectorAll<HTMLElement>("[data-animate]").forEach((el) => {
    Object.keys(JSON.parse(el.dataset.animate ?? "{}")).forEach((k) => keys.add(k));
  });
  return keys;
}

describe("game card banners (V9)", () => {
  afterEach(cleanup);

  it("Orbital Dodge drifts on a transform translate and never animates top", () => {
    const { container } = render(<SpaceShooterBanner />);
    const keys = animatedKeys(container);
    expect(keys.has("top")).toBe(false);
    expect(keys.has("y")).toBe(true);
  });

  it("Orbital Dodge scrolling layers are parked at top-0 and move by translate", () => {
    const { container } = render(<SpaceShooterBanner />);
    const moving = Array.from(container.querySelectorAll<HTMLElement>("[data-animate]")).filter(
      (el) => "y" in JSON.parse(el.dataset.animate ?? "{}"),
    );
    const parked = moving.filter((el) => el.classList.contains("top-0"));
    // 3 backdrop layers + 16 streaks + 6 asteroids + 3 bullets + 3 coins; the
    // ship's own 4 px bob is the only other y animation and keeps its top.
    expect(parked.length).toBe(31);
    expect(moving.length - parked.length).toBe(1);
  });

  it("Typing Speed confetti rises by translate, not top", () => {
    const { container } = render(<TypingSpeedBanner />);
    expect(animatedKeys(container).has("top")).toBe(false);
    expect(animatedKeys(container).has("y")).toBe(true);
  });
});
