import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypingSpeedGame } from "../../typing-speed";
import { STATS_KEY, emptyStats } from "../stats";
import {
  fakeVV,
  getInput,
  resizeVV,
  restoreViewport,
  stubViewportClass,
  typeInto,
} from "./phone-helpers";

vi.mock("../engine/text", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/text")>()),
  passageAt: () => ({ id: "t-1", source: "austen-pp", text: "ab cd" }),
}));

function typeText(text: string) {
  for (const ch of text) typeInto(getInput(), getInput().value + ch);
}

const start = () => fireEvent.click(screen.getByRole("button", { name: /start typing/i }));

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(STATS_KEY, JSON.stringify({ ...emptyStats(), lastMode: "quote" }));
});

afterEach(() => {
  cleanup();
  restoreViewport();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
  document.documentElement.classList.remove("typing-lock");
});

describe("the phone play sheet", () => {
  it("opens on Start below 1024 px, locks the page, and Exit gives both back", () => {
    stubViewportClass(true);
    fakeVV(844);
    render(<TypingSpeedGame />);
    expect(screen.queryByTestId("ts-sheet")).toBeNull();
    start();
    const sheet = screen.getByTestId("ts-sheet");
    expect(sheet).toHaveClass("fixed");
    expect(document.documentElement).toHaveClass("typing-lock");
    expect(within(sheet).getByTestId("ts-target")).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("button", { name: "Exit" }));
    expect(screen.queryByTestId("ts-sheet")).toBeNull();
    expect(document.documentElement).not.toHaveClass("typing-lock");
    // Exit abandons the run: the start button is back and the keyboard is closed.
    expect(screen.getByRole("button", { name: /start typing/i })).toBeInTheDocument();
    expect(document.activeElement).not.toBe(getInput());
  });

  it("releases the lock when the game unmounts mid-run", () => {
    stubViewportClass(true);
    fakeVV(844);
    const { unmount } = render(<TypingSpeedGame />);
    start();
    typeText("a");
    expect(document.documentElement).toHaveClass("typing-lock");
    unmount();
    expect(document.documentElement).not.toHaveClass("typing-lock");
  });

  it("finishing a run closes the sheet, releases the lock and blurs the input", () => {
    stubViewportClass(true);
    fakeVV(844);
    render(<TypingSpeedGame />);
    start();
    typeText("ab cd");
    expect(screen.getByTestId("ts-net-wpm")).toBeInTheDocument();
    expect(screen.queryByTestId("ts-sheet")).toBeNull();
    expect(document.documentElement).not.toHaveClass("typing-lock");
    expect(document.activeElement).not.toBe(getInput());
  });

  it("follows the visual viewport height", () => {
    stubViewportClass(true);
    const vv = fakeVV(844);
    render(<TypingSpeedGame />);
    start();
    const sheet = screen.getByTestId("ts-sheet");
    expect(sheet.style.getPropertyValue("--ts-vv-h")).toBe("844px");
    resizeVV(vv, 500);
    expect(sheet.style.getPropertyValue("--ts-vv-h")).toBe("500px");
  });

  it("does not exist at 1024 px and up", () => {
    stubViewportClass(false);
    fakeVV(900, 1280);
    render(<TypingSpeedGame />);
    start();
    expect(screen.queryByTestId("ts-sheet")).toBeNull();
    expect(document.documentElement).not.toHaveClass("typing-lock");
  });

  it("has nothing that rises into view while the keyboard is open", () => {
    stubViewportClass(true);
    const vv = fakeVV(844);
    render(<TypingSpeedGame />);
    start();
    resizeVV(vv, 450);
    const sheet = screen.getByTestId("ts-sheet");
    expect(sheet.querySelectorAll("[class*='slide-in'], [class*='translate-y']")).toHaveLength(0);
    expect(sheet.querySelectorAll("[style*='translateY'], [style*='translate3d']")).toHaveLength(0);
  });

  it("drops the live graph when the keyboard is open", () => {
    stubViewportClass(true);
    const vv = fakeVV(844);
    render(<TypingSpeedGame />);
    start();
    expect(screen.getByTestId("ts-live-slot")).toBeInTheDocument();
    resizeVV(vv, 450);
    expect(screen.queryByTestId("ts-live-slot")).toBeNull();
  });

  it("makes the game's own page chrome inert while the sheet is up, on every way out", () => {
    const setPhone = stubViewportClass(true);
    fakeVV(844);
    render(<TypingSpeedGame />);
    const inertCount = () => document.querySelectorAll("[inert]").length;
    expect(inertCount()).toBe(0);
    start();
    expect(inertCount()).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Exit" }));
    expect(inertCount()).toBe(0);
    start();
    expect(inertCount()).toBe(2);
    for (const ch of "ab cd") typeInto(getInput(), getInput().value + ch);
    expect(inertCount()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /again/i }));
    expect(inertCount()).toBe(2);
    setPhone(false);
    expect(inertCount()).toBe(0);
  });

  it("does not reopen on a finished run when the width goes back under 1024 px", () => {
    const setPhone = stubViewportClass(true);
    fakeVV(844);
    render(<TypingSpeedGame />);
    start();
    setPhone(false);
    expect(screen.queryByTestId("ts-sheet")).toBeNull();
    for (const ch of "ab cd") typeInto(getInput(), getInput().value + ch);
    expect(screen.getByTestId("ts-net-wpm")).toBeInTheDocument();
    setPhone(true);
    expect(screen.queryByTestId("ts-sheet")).toBeNull();
    expect(document.documentElement).not.toHaveClass("typing-lock");
  });

  it("keeps the hidden input at the top of the visible area as the viewport scrolls", () => {
    stubViewportClass(true);
    const vv = fakeVV(844);
    render(<TypingSpeedGame />);
    start();
    act(() => {
      vv.height = 450;
      vv.offsetTop = 120;
      vv.dispatchEvent(new Event("scroll"));
    });
    expect(getInput().style.top).toBe("120px");
    expect(screen.getByTestId("ts-sheet").style.getPropertyValue("--ts-vv-top")).toBe("120px");
  });

  it("scrolls the results clear of the fixed navbar", () => {
    stubViewportClass(true);
    fakeVV(844);
    render(<TypingSpeedGame />);
    start();
    for (const ch of "ab cd") typeInto(getInput(), getInput().value + ch);
    expect(screen.getByTestId("ts-net-wpm").closest(".scroll-mt-20")).not.toBeNull();
  });

  it("keeps the keyboard up when a HUD button is pressed", () => {
    stubViewportClass(true);
    fakeVV(844);
    render(<TypingSpeedGame />);
    start();
    const down = new Event("pointerdown", { bubbles: true, cancelable: true });
    within(screen.getByTestId("ts-sheet"))
      .getByRole("button", { name: "Restart" })
      .dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  it("tells a phone player to tap, and a desktop player to click or press a key", () => {
    stubViewportClass(true);
    fakeVV(844);
    const { unmount } = render(<TypingSpeedGame />);
    expect(screen.getByText("Tap the text to start.")).toBeInTheDocument();
    unmount();
    stubViewportClass(false);
    render(<TypingSpeedGame />);
    expect(screen.getByText(/press any key to start/)).toBeInTheDocument();
  });

  it("squeezes the text to 14 px on a landscape phone with the keyboard up", () => {
    stubViewportClass(true);
    const vv = fakeVV(390, 844);
    render(<TypingSpeedGame />);
    start();
    resizeVV(vv, 200);
    expect(screen.getByTestId("ts-target").parentElement!.style.fontSize).toBe("14px");
  });

  it("Restart in the sheet starts over and keeps the input focused", () => {
    stubViewportClass(true);
    fakeVV(844);
    render(<TypingSpeedGame />);
    start();
    typeText("a");
    act(() => {
      fireEvent.click(
        within(screen.getByTestId("ts-sheet")).getByRole("button", { name: "Restart" }),
      );
    });
    expect(screen.getByTestId("ts-sheet")).toBeInTheDocument();
    expect(document.activeElement).toBe(getInput());
    expect(getInput().value).toBe(" ");
  });
});
