import { afterEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { CountUp } from "../count-up";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CountUp", () => {
  it("starts below the target and lands on it after the duration", () => {
    vi.useFakeTimers();
    render(<CountUp target={4200} durationMs={900} />);
    expect(Number(screen.getByTestId("count-up").textContent)).toBeLessThan(4200);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("count-up").textContent).toBe("4200");
  });

  it("shows a zero target immediately", () => {
    render(<CountUp target={0} durationMs={900} />);
    expect(screen.getByTestId("count-up").textContent).toBe("0");
  });

  it("renders the final value at once when reduced motion is on", () => {
    vi.useFakeTimers();
    render(<CountUp target={4200} durationMs={900} reducedMotion />);
    expect(screen.getByTestId("count-up").textContent).toBe("4200");
  });
});
