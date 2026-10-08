import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KeyMap, missTier } from "../key-map";

afterEach(cleanup);

describe("missTier", () => {
  it("is 0 with no misses, then 1-4 by miss rate", () => {
    expect(missTier(50, 0)).toBe(0);
    expect(missTier(99, 1)).toBe(1); // 1%
    expect(missTier(98, 2)).toBe(1); // 2%
    expect(missTier(96, 4)).toBe(2); // 4%
    expect(missTier(95, 5)).toBe(2); // 5%
    expect(missTier(92, 8)).toBe(3); // 8%
    expect(missTier(90, 10)).toBe(3); // 10%
    expect(missTier(80, 20)).toBe(4);
    expect(missTier(0, 1)).toBe(4);
  });
});

const run = { e: { hits: 56, misses: 4 }, t: { hits: 10, misses: 0 }, " ": { hits: 5, misses: 5 } };
const all = { e: { hits: 100, misses: 30 }, q: { hits: 1, misses: 1 } };

describe("KeyMap", () => {
  it("renders the QWERTY rows, a punctuation row and a space bar", () => {
    const { container } = render(<KeyMap run={run} all={all} />);
    const keys = [...container.querySelectorAll("[data-key]")].map((k) =>
      k.getAttribute("data-key"),
    );
    for (const k of "qwertyuiopasdfghjklzxcvbnm") expect(keys).toContain(k);
    for (const k of [",", ".", ";", ":", "'", '"', "!", "?", "-", " "]) expect(keys).toContain(k);
  });
  it("tiers typed keys and dims keys never typed", () => {
    const { container } = render(<KeyMap run={run} all={all} />);
    const key = (k: string) => container.querySelector(`[data-key="${k}"]`);
    expect(key("e")).toHaveAttribute("data-tier", "3"); // 4 of 60 is 6.7%
    expect(key("t")).toHaveAttribute("data-tier", "0");
    expect(key("t")).toHaveAttribute("data-typed", "true");
    expect(key("q")).toHaveAttribute("data-typed", "false");
  });
  it("lists the most missed keys for screen readers", () => {
    const { container } = render(<KeyMap run={run} all={all} />);
    expect(container.querySelector(".sr-only")?.textContent).toContain("e: 4 of 60");
  });
  it("says so when nothing was missed", () => {
    const { container } = render(<KeyMap run={{ e: { hits: 3, misses: 0 } }} all={{}} />);
    expect(container.querySelector(".sr-only")?.textContent).toContain("No missed keys");
  });
  it("switches between this run and all runs", () => {
    const { container } = render(<KeyMap run={run} all={all} />);
    const thisRun = screen.getByRole("button", { name: "This run" });
    const allRuns = screen.getByRole("button", { name: "All runs" });
    expect(thisRun).toHaveAttribute("aria-pressed", "true");
    expect(allRuns).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(allRuns);
    expect(allRuns).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".sr-only")?.textContent).toContain("e: 30 of 130");
    for (const b of [thisRun, allRuns]) expect(b).toHaveClass("min-h-11", "font-sans");
  });
});
