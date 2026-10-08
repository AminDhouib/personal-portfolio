import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypingSpeedGame } from "../../typing-speed";
import { STATS_KEY, emptyStats } from "../stats";
import { fakeVV, getInput, restoreViewport, stubViewportClass } from "./phone-helpers";

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

const start = () => fireEvent.click(screen.getByRole("button", { name: /start typing/i }));

describe("the hidden input on a phone", () => {
  it("is keyboard-safe: no autocorrect, no capitals, 16 px so iOS does not zoom", () => {
    render(<TypingSpeedGame />);
    const input = getInput();
    expect(input).toHaveAttribute("inputmode", "text");
    expect(input).toHaveAttribute("enterkeyhint", "next");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("autocapitalize", "none");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveClass("text-base", "fixed", "opacity-0", "pointer-events-none");
  });

  it("is mounted before the sheet opens, so focus never waits on a render", () => {
    render(<TypingSpeedGame />);
    expect(screen.queryByTestId("ts-sheet")).toBeNull();
    const input = getInput();
    expect(input).toBeInTheDocument();
    start();
    expect(getInput()).toBe(input);
  });

  it("is focused immediately after the Start click, with no timer advanced (audit bug 4)", () => {
    vi.useFakeTimers();
    try {
      render(<TypingSpeedGame />);
      start();
      expect(document.activeElement).toBe(getInput());
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks for a tap when the keyboard is dismissed mid-run, and a tap on the text recovers", () => {
    render(<TypingSpeedGame />);
    start();
    expect(screen.queryByTestId("ts-refocus")).toBeNull();
    fireEvent.blur(getInput());
    getInput().blur();
    expect(screen.getByTestId("ts-refocus")).toHaveTextContent("Tap the text to keep typing");
    fireEvent.click(screen.getByTestId("ts-target"));
    expect(document.activeElement).toBe(getInput());
    expect(screen.queryByTestId("ts-refocus")).toBeNull();
  });
});
