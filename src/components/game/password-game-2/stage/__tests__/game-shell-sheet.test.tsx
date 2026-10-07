import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

import { GameShell } from "../game-shell";

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

function fakeVV(height: number) {
  const vv = Object.assign(new EventTarget(), { height, offsetTop: 0, width: 390 });
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  return vv;
}

function renderStartedShell() {
  const utils = render(<GameShell />);
  fireEvent.click(utils.getByRole("button", { name: /random seed/i }));
  return utils;
}

/**
 * The phone play sheet: below 1024 px a run plays in a fixed sheet that is exactly the
 * visible area (visualViewport), never scrolls the page, and hands the page back (scroll
 * lock released, focus returned) on Exit and on unmount.
 */
describe("GameShell phone play sheet", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    stubMatchMedia(() => false); // below 1024: the phone layout
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "visualViewport");
    document.documentElement.classList.remove("pg2-lock");
  });

  it("playing renders a fixed sheet and locks page scroll, released on unmount", () => {
    const { getByTestId, unmount } = renderStartedShell();
    const sheet = getByTestId("pg2-sheet");
    expect(sheet.className).toContain("fixed");
    expect(document.documentElement.classList.contains("pg2-lock")).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains("pg2-lock")).toBe(false);
  });

  it("does not lock page scroll outside of play (start screen)", () => {
    const { queryByTestId } = render(<GameShell />);
    expect(queryByTestId("pg2-sheet")).toBeNull();
    expect(document.documentElement.classList.contains("pg2-lock")).toBe(false);
  });

  it("desktop is never a sheet and never locks the page", () => {
    stubMatchMedia(isDesktop);
    const { queryByTestId } = renderStartedShell();
    expect(queryByTestId("pg2-sheet")).toBeNull();
    expect(document.documentElement.classList.contains("pg2-lock")).toBe(false);
  });

  it("the sheet height and offset follow the visual viewport vars", () => {
    const vv = fakeVV(844);
    const { getByTestId } = renderStartedShell();
    expect(getByTestId("pg2-sheet").style.getPropertyValue("--pg2-vv-h")).toBe("844px");
    act(() => {
      vv.height = 500;
      vv.offsetTop = 40;
      vv.dispatchEvent(new Event("resize"));
    });
    const sheet = getByTestId("pg2-sheet");
    expect(sheet.style.getPropertyValue("--pg2-vv-h")).toBe("500px");
    expect(sheet.style.getPropertyValue("--pg2-vv-top")).toBe("40px");
    expect(sheet.className).toContain("pg2-sheet--kb");
  });

  it("Exit needs a second tap and every HUD control is at least 44px", () => {
    const { getByRole, getByTestId } = renderStartedShell();
    const exit = getByRole("button", { name: /^exit/i });
    expect(exit.className).toContain("min-h-11");
    fireEvent.click(exit);
    expect(getByRole("button", { name: /confirm exit/i })).toBeTruthy();
    for (const b of within(getByTestId("pg2-hud")).getAllByRole("button")) {
      expect(b.className).toMatch(/min-h-11|h-11/);
    }
  });

  it("Exit releases the scroll lock and returns focus to the start screen", () => {
    const { getByRole, queryByTestId } = renderStartedShell();
    fireEvent.click(getByRole("button", { name: /^exit/i }));
    fireEvent.click(getByRole("button", { name: /confirm exit/i }));
    expect(queryByTestId("pg2-sheet")).toBeNull();
    expect(document.documentElement.classList.contains("pg2-lock")).toBe(false);
    expect(document.activeElement).toBe(getByRole("button", { name: /start today/i }));
  });

  it("an unconfirmed Exit reverts after a few seconds", () => {
    vi.useFakeTimers();
    const { getByRole, queryByRole } = renderStartedShell();
    fireEvent.click(getByRole("button", { name: /^exit/i }));
    expect(queryByRole("button", { name: /confirm exit/i })).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(queryByRole("button", { name: /confirm exit/i })).toBeNull();
  });

  it("the old best-on-desktop banner is gone", () => {
    stubMatchMedia((q) => q.includes("max-width: 767px")); // a phone-width viewport
    const { queryByText } = render(<GameShell />);
    expect(queryByText(/best played on desktop/i)).toBeNull();
  });
});
