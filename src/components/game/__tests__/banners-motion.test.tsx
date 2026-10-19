import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { SpaceShooterBanner, TypingSpeedBanner } from "../banners";

const reducedMotion = vi.hoisted(() => ({ value: false as boolean | null }));

// Replace framer-motion's tags with plain elements that expose the `animate`
// and `style` props as JSON, so the test reads exactly what a banner animates.
vi.mock("framer-motion", async () => {
  const tag = (name: string) => {
    const Component = ({
      children,
      animate,
      className,
      style,
    }: {
      children?: ReactNode;
      animate?: unknown;
      className?: string;
      style?: unknown;
    }) =>
      createElement(
        name,
        {
          className,
          "data-animate": animate === undefined ? undefined : JSON.stringify(animate),
          "data-style": style === undefined ? undefined : JSON.stringify(style),
        },
        children,
      );
    return Component;
  };
  return {
    motion: new Proxy({}, { get: (_t, name: string) => tag(name) }),
    useMotionValue: () => ({ on: () => () => {} }),
    useReducedMotion: () => reducedMotion.value,
    animate: () => ({ stop: () => {} }),
  };
});

type Animate = Record<string, unknown>;

function animateOf(el: HTMLElement): Animate {
  return JSON.parse(el.dataset.animate ?? "{}") as Animate;
}

function styleOf(el: HTMLElement): Record<string, unknown> {
  return JSON.parse(el.dataset.style ?? "{}") as Record<string, unknown>;
}

function animated(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-animate]"));
}

function animatedKeys(container: HTMLElement): Set<string> {
  const keys = new Set<string>();
  animated(container).forEach((el) => Object.keys(animateOf(el)).forEach((k) => keys.add(k)));
  return keys;
}

// The layers that drift: parked at top-0 and moved by a y translate.
function driftLayers(container: HTMLElement): HTMLElement[] {
  return animated(container).filter((el) => el.classList.contains("top-0") && "y" in animateOf(el));
}

function pct(value: unknown): number {
  expect(typeof value).toBe("string");
  expect(value as string).toMatch(/%$/);
  return parseFloat(value as string);
}

describe("game card banners (V9)", () => {
  afterEach(() => {
    cleanup();
    reducedMotion.value = false;
  });

  it("Orbital Dodge drifts on a transform translate and never animates top", () => {
    const { container } = render(<SpaceShooterBanner />);
    const keys = animatedKeys(container);
    expect(keys.has("top")).toBe(false);
    expect(keys.has("y")).toBe(true);
  });

  it("Orbital Dodge scrolling layers are parked at top-0 and move by translate", () => {
    const { container } = render(<SpaceShooterBanner />);
    const moving = animated(container).filter((el) => "y" in animateOf(el));
    const parked = moving.filter((el) => el.classList.contains("top-0"));
    // 3 backdrop layers + 16 streaks + 6 asteroids + 3 bullets + 3 coins; the
    // ship's own 4 px bob is the only other y animation and keeps its top.
    expect(parked.length).toBe(31);
    expect(moving.length - parked.length).toBe(1);
  });

  it("pins the exact y keyframes that reproduce the old top drifts", () => {
    const { container } = render(<SpaceShooterBanner />);
    const layers = driftLayers(container);

    const nebula1 = layers.find((el) => el.classList.contains("h-[80%]"));
    const nebula2 = layers.find((el) => el.classList.contains("h-[60%]"));
    const starfield = layers.find(
      (el) => el.classList.contains("left-0") && el.classList.contains("w-full"),
    );
    expect(animateOf(nebula1 as HTMLElement).y).toEqual(["-25%", "100%"]);
    expect(animateOf(nebula2 as HTMLElement).y).toEqual(["16.667%", "183.333%"]);
    expect(animateOf(starfield as HTMLElement).y).toEqual(["0%", "25%"]);

    // Streak 0: seed 1031 -> len 8 + (1031 % 12) = 19; drift -15%..110% of the
    // banner expressed against the streak's own height.
    const streaks = layers.filter((el) => styleOf(el).width === 1);
    expect(streaks.length).toBe(16);
    const first = streaks[0] as HTMLElement;
    const len = parseFloat(String(styleOf(first).height));
    expect(len).toBe(19);
    expect(animateOf(first).y).toEqual([`${(-15 / len) * 100}%`, `${(110 / len) * 100}%`]);
  });

  it("Typing Speed confetti rises by translate, not top", () => {
    const { container } = render(<TypingSpeedBanner />);
    expect(animatedKeys(container).has("top")).toBe(false);
    expect(animatedKeys(container).has("y")).toBe(true);
  });
});

describe("game card banners under reduced motion", () => {
  afterEach(() => {
    cleanup();
    reducedMotion.value = false;
  });

  it("renders every Orbital Dodge drift layer static and in view, never as a keyframe array", () => {
    reducedMotion.value = true;
    const { container } = render(<SpaceShooterBanner />);
    const layers = driftLayers(container);
    expect(layers.length).toBe(31);

    for (const el of layers) {
      const { y } = animateOf(el);
      expect(Array.isArray(y)).toBe(false);
      expect(typeof y).toBe("string");
    }

    // Full-height wrapper sprites (asteroids, bullets, coins) stay inside the banner.
    const sprites = layers.filter((el) => el.classList.contains("h-full"));
    expect(sprites.length).toBe(12);
    for (const el of sprites) {
      const y = pct(animateOf(el).y);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
    }

    // They spread out rather than bunching at one spot.
    expect(new Set(sprites.map((el) => animateOf(el).y)).size).toBeGreaterThan(8);

    // The starfield sits at 0 so stars cover the whole banner.
    const starfield = layers.find(
      (el) => el.classList.contains("left-0") && el.classList.contains("w-full"),
    );
    expect(animateOf(starfield as HTMLElement).y).toBe("0%");

    // Each streak's top edge lands inside the banner (y is relative to its own height).
    for (const el of layers.filter((l) => styleOf(l).width === 1)) {
      const len = parseFloat(String(styleOf(el).height));
      const top = (pct(animateOf(el).y) / 100) * len;
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top).toBeLessThanOrEqual(80);
    }
  });

  it("keeps the Orbital Dodge opacity pulses running", () => {
    reducedMotion.value = true;
    const { container } = render(<SpaceShooterBanner />);
    const pulse = animated(container).find((el) => "scaleY" in animateOf(el));
    expect(Array.isArray(animateOf(pulse as HTMLElement).opacity)).toBe(true);
  });

  it("renders Typing Speed confetti static and visible", () => {
    reducedMotion.value = true;
    const { container } = render(<TypingSpeedBanner />);
    const confetti = driftLayers(container);
    expect(confetti.length).toBe(5);
    for (const el of confetti) {
      const a = animateOf(el);
      expect(Array.isArray(a.y)).toBe(false);
      expect(Array.isArray(a.x)).toBe(false);
      expect(Array.isArray(a.opacity)).toBe(false);
      const y = pct(a.y);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
      expect(a.opacity).toBeGreaterThan(0);
    }
  });
});
