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

/** Synthetic keydowns can target the window or document, which have no .closest. */
describe("GameShell keydown from a non-Element target", () => {
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
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("ignores keydowns whose target is not an Element (no TypeError)", () => {
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => errors.push(e.error);
    window.addEventListener("error", onError);
    try {
      const { getByRole } = render(<GameShell />);
      fireEvent.click(getByRole("button", { name: /random seed/i }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
      expect(errors).toEqual([]);
    } finally {
      window.removeEventListener("error", onError);
    }
  });
});

// --- stage layout ---------------------------------------------------------------

/** matchMedia whose queries match when `matches(query)` is true (desktop = min-width 1024). */
function stubMatchMedia(matches: (query: string) => boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const isDesktop = (q: string) => q.includes("min-width: 1024px");

function renderStartedShell() {
  const utils = render(<GameShell />);
  fireEvent.click(utils.getByRole("button", { name: /random seed/i }));
  return utils;
}

describe("GameShell stage layout", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("desktop: rules sit beside the stage card, not inside it", () => {
    stubMatchMedia(isDesktop);
    const { getByTestId } = renderStartedShell();
    const card = getByTestId("pg2-stage-card");
    const rules = getByTestId("pg2-rules");
    expect(card.contains(rules)).toBe(false);
    expect(card.querySelector(".pg2-box")).not.toBeNull();
    expect(card.parentElement).toBe(rules.parentElement); // siblings in the .pg2-play grid
    expect(card.parentElement!.className).toContain("pg2-play");
  });

  it("scopes the canvas overlay to the stage card", () => {
    stubMatchMedia(isDesktop);
    const { getByTestId, container } = renderStartedShell();
    const card = getByTestId("pg2-stage-card");
    expect(card.contains(container.querySelector("canvas.pg2-overlay"))).toBe(true);
  });

  it("the rule column scrolls inside its own region", () => {
    stubMatchMedia(isDesktop);
    const { getByTestId } = renderStartedShell();
    expect(getByTestId("pg2-rules").className).toContain("overflow-y-auto");
  });
});
