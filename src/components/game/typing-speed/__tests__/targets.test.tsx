import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypingSpeedGame } from "../../typing-speed";
import { STATS_KEY, emptyStats } from "../stats";
import { fakeVV, getInput, restoreViewport, stubViewportClass, typeInto } from "./phone-helpers";

vi.mock("../engine/text", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/text")>()),
  passageAt: () => ({ id: "t-1", source: "austen-pp", text: "ab cd" }),
}));

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(STATS_KEY, JSON.stringify({ ...emptyStats(), lastMode: "quote" }));
  stubViewportClass(true);
  fakeVV(844);
});

afterEach(() => {
  cleanup();
  restoreViewport();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.classList.remove("typing-lock");
});

/** jsdom has no layout, so the 44 px contract is checked on the classes that set it. */
function expectTargets() {
  const controls = [...document.querySelectorAll<HTMLElement>("button, [role='button']")];
  expect(controls.length).toBeGreaterThan(0);
  for (const el of controls) {
    const name = el.getAttribute("aria-label") ?? el.textContent;
    const tall = el.classList.contains("min-h-11") || el.classList.contains("h-11");
    const wide = el.classList.contains("min-w-11") || el.classList.contains("w-11");
    expect({ name, tall }).toEqual({ name, tall: true });
    expect({ name, wide }).toEqual({ name, wide: true });
    expect({ name, touch: el.classList.contains("touch-manipulation") }).toEqual({
      name,
      touch: true,
    });
  }
}

describe("44 px targets", () => {
  it("at rest", () => {
    render(<TypingSpeedGame />);
    expectTargets();
  });

  it("in the sheet, mid-run", () => {
    render(<TypingSpeedGame />);
    fireEvent.click(screen.getByRole("button", { name: /start typing/i }));
    typeInto(getInput(), getInput().value + "a");
    expect(screen.getByTestId("ts-sheet")).toBeInTheDocument();
    expectTargets();
  });

  it("on the results card", () => {
    render(<TypingSpeedGame />);
    fireEvent.click(screen.getByRole("button", { name: /start typing/i }));
    for (const ch of "ab cd") typeInto(getInput(), getInput().value + ch);
    expect(screen.getByTestId("ts-net-wpm")).toBeInTheDocument();
    expectTargets();
  });
});
