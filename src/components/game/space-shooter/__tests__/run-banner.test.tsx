import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RunBanner, BANNER_MS } from "../run-banner";

afterEach(() => {
  cleanup();
});

describe("RunBanner", () => {
  it("shows WAVE 1 for the first 2.5 s of a run", () => {
    expect(BANNER_MS).toBe(2500);
    render(<RunBanner startedAt={1000} now={1000} />);
    expect(screen.getByText("WAVE 1")).toBeTruthy();
  });

  it("is still up just before the cutoff", () => {
    render(<RunBanner startedAt={1000} now={1000 + BANNER_MS - 1} />);
    expect(screen.getByText("WAVE 1")).toBeTruthy();
  });

  it("is gone at and after the cutoff", () => {
    render(<RunBanner startedAt={1000} now={1000 + BANNER_MS} />);
    expect(screen.queryByText("WAVE 1")).toBeNull();
  });

  it("ignores pointer events so it never blocks steering", () => {
    render(<RunBanner startedAt={0} now={100} />);
    expect(screen.getByText("WAVE 1").parentElement?.className).toContain("pointer-events-none");
  });
});
