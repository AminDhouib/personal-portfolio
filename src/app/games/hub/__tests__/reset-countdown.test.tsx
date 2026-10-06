import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { formatResetCountdown, msUntilUtcMidnight, useResetCountdown } from "../reset-countdown";

function Probe() {
  const label = useResetCountdown();
  return <p data-testid="probe">{label ?? "server"}</p>;
}

describe("msUntilUtcMidnight", () => {
  it("counts to the next 00:00 UTC", () => {
    expect(msUntilUtcMidnight(new Date("2026-10-06T18:48:00Z"))).toBe(18_720_000);
  });

  it("is a full day at exactly midnight", () => {
    expect(msUntilUtcMidnight(new Date("2026-10-06T00:00:00Z"))).toBe(86_400_000);
  });

  it("is 30 seconds before the end of a month", () => {
    expect(msUntilUtcMidnight(new Date("2026-10-31T23:59:30Z"))).toBe(30_000);
  });

  it("rolls over a year end", () => {
    expect(msUntilUtcMidnight(new Date("2026-12-31T23:00:00Z"))).toBe(3_600_000);
  });

  it("uses the UTC day, not the local one", () => {
    // 2026-10-06 23:30 at UTC-5 is already 2026-10-07T04:30Z.
    expect(msUntilUtcMidnight(new Date("2026-10-07T04:30:00Z"))).toBe(19 * 3_600_000 + 30 * 60_000);
  });
});

describe("formatResetCountdown", () => {
  it("shows hours and minutes", () => {
    expect(formatResetCountdown(18_720_000)).toBe("Resets in 5h 12m");
  });

  it("keeps a zero minutes part on a whole hour", () => {
    expect(formatResetCountdown(3_600_000)).toBe("Resets in 1h 0m");
  });

  it("drops the hours under an hour", () => {
    expect(formatResetCountdown(59 * 60_000)).toBe("Resets in 59m");
  });

  it("rounds a partial minute up", () => {
    expect(formatResetCountdown(30_000)).toBe("Resets in 1m");
  });

  it("treats zero, negative and non-finite input as 0m", () => {
    for (const ms of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatResetCountdown(ms)).toBe("Resets in 0m");
    }
  });
});

describe("useResetCountdown", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders nothing time-dependent on the server", () => {
    expect(renderToString(<Probe />)).toContain("server");
  });

  it("shows the live countdown on the client and re-reads it every 30 seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T18:48:00Z"));
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("Resets in 5h 12m");
    act(() => {
      vi.advanceTimersByTime(30 * 60_000);
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("Resets in 4h 42m");
  });

  it("stops ticking after unmount", () => {
    vi.useFakeTimers();
    const set = vi.spyOn(globalThis, "setInterval");
    const clear = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = render(<Probe />);
    expect(set).toHaveBeenCalledWith(expect.any(Function), 30_000);
    const id: unknown = set.mock.results[0]?.value;
    unmount();
    expect(clear).toHaveBeenCalledWith(id);
  });
});
