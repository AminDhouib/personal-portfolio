import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

// The shell reads ?seed via next/navigation and drives a rAF loop; stub the router
// and freeze rAF so the run starts deterministically without the frame loop ticking.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

import { GameShell } from "../game-shell";

/**
 * Shell-level regression for the global keydown scope. The window keydown listener
 * types printable keys into the password, but it must NOT do so when the keystroke
 * is aimed at a focused control — otherwise Space is preventDefault-ed and typed,
 * breaking Space-activation on every in-run button. This is the test that would
 * have caught that defect.
 */
describe("GameShell global keydown scope", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    // Freeze the animation loop: keep the keydown listener wired, but never tick.
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("types to the password on body focus but never steals keys aimed at a control", () => {
    const { container, getByRole } = render(<GameShell />);
    fireEvent.click(getByRole("button", { name: /random seed/i })); // begin a run

    const cellCount = () => container.querySelectorAll("[data-cell-id]").length;
    expect(cellCount()).toBe(0);

    // (a) Space while a button is focused belongs to the button: not intercepted,
    // not preventDefault-ed, and nothing is typed. fireEvent returns true when the
    // event was NOT cancelled.
    const submit = getByRole("button", { name: /create account/i });
    const spaceNotCancelled = fireEvent.keyDown(submit, { key: " " });
    expect(spaceNotCancelled).toBe(true);
    expect(cellCount()).toBe(0);

    // (b) A printable key with body focus is typed into the password (and the
    // default is prevented, so fireEvent returns false).
    const letterCancelled = fireEvent.keyDown(document.body, { key: "a" });
    expect(letterCancelled).toBe(false);
    expect(cellCount()).toBe(1);

    // (c) Backspace with body focus removes the character.
    fireEvent.keyDown(document.body, { key: "Backspace" });
    expect(cellCount()).toBe(0);

    // (d) A keystroke delivered mid-IME-composition is ignored entirely.
    fireEvent.keyDown(document.body, { key: "b", isComposing: true });
    expect(cellCount()).toBe(0);
  });

  it("keeps typing and Backspace working after the box is clicked (hidden input focused)", () => {
    const { container, getByRole } = render(<GameShell />);
    fireEvent.click(getByRole("button", { name: /random seed/i }));

    const cellCount = () => container.querySelectorAll("[data-cell-id]").length;
    // Clicking the box focuses the hidden mobile input — the game surface. It is
    // deliberately excluded from the bail selector, so keydowns aimed at it still
    // route to the password (unlike a button or link).
    const box = container.querySelector("[data-pg2-box]")!;
    fireEvent.mouseDown(box);
    const hidden = container.querySelector("input")!;

    fireEvent.keyDown(hidden, { key: "x" });
    expect(cellCount()).toBe(1);
    fireEvent.keyDown(hidden, { key: "Backspace" });
    expect(cellCount()).toBe(0);
  });
});
