import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

import { GameShell } from "../game-shell";

/** A matchMedia whose desktop query can be flipped live, firing the change listeners. */
function controllableMedia(initialDesktop: boolean) {
  let desktop = initialDesktop;
  const listeners = new Set<() => void>();
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const isDesktopQuery = query.includes("min-width: 1024px");
    return {
      get matches() {
        return isDesktopQuery ? desktop : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_t: string, fn: () => void) => {
        if (isDesktopQuery) listeners.add(fn);
      },
      removeEventListener: (_t: string, fn: () => void) => listeners.delete(fn),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
  return {
    set(next: boolean) {
      desktop = next;
      act(() => {
        for (const fn of listeners) fn();
      });
    },
  };
}

function fakeVV(height: number) {
  const vv = Object.assign(new EventTarget(), { height, offsetTop: 0, width: 390, scale: 1 });
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  return vv;
}

function startRun(utils: ReturnType<typeof render>) {
  fireEvent.click(utils.getByRole("button", { name: /random seed/i }));
}

describe("GameShell phone sheet review fixes", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "visualViewport");
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    document.documentElement.classList.remove("pg2-lock");
  });

  it("the sheet scrolls when the card overflows, so a tall password is never clipped", () => {
    controllableMedia(false);
    const utils = render(<GameShell />);
    startRun(utils);
    const cls = utils.getByTestId("pg2-sheet").className;
    expect(cls).toContain("overflow-y-auto");
    expect(cls).toContain("overscroll-contain");
    expect(cls).not.toContain("overflow-hidden");
  });

  it("with the keyboard open, typing keeps the caret in view", () => {
    controllableMedia(false);
    const vv = fakeVV(844);
    const seen: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      seen.push(this);
    };
    const utils = render(<GameShell />);
    startRun(utils);
    act(() => {
      vv.height = 300;
      vv.dispatchEvent(new Event("resize"));
    });
    seen.length = 0;
    fireEvent.keyDown(document.body, { key: "a" });
    expect(seen.some((el) => el.classList.contains("pg2-caret"))).toBe(true);
  });

  it("crossing the desktop breakpoint mid-run keeps the same stage card node", () => {
    const media = controllableMedia(true);
    const utils = render(<GameShell />);
    startRun(utils);
    const card = utils.getByTestId("pg2-stage-card");
    const hud = utils.getByTestId("pg2-hud");
    media.set(false);
    expect(utils.getByTestId("pg2-sheet")).toBeTruthy();
    expect(utils.getByTestId("pg2-stage-card")).toBe(card);
    expect(utils.getByTestId("pg2-hud")).toBe(hud);
    media.set(true);
    expect(utils.queryByTestId("pg2-sheet")).toBeNull();
    expect(utils.getByTestId("pg2-stage-card")).toBe(card);
  });

  it("the toast stack follows the visual viewport while the sheet is up", () => {
    controllableMedia(false);
    const vv = fakeVV(844);
    const utils = render(<GameShell />);
    startRun(utils);
    act(() => {
      vv.height = 500;
      vv.offsetTop = 40;
      vv.dispatchEvent(new Event("resize"));
    });
    const toasts = utils.getByTestId("pg2-toasts");
    expect(toasts.style.top).toBe("40px");
    expect(toasts.style.height).toBe("500px");
  });

  it("with the keyboard open the sheet is the only scroller; closed, the rule region scrolls", () => {
    controllableMedia(false);
    const vv = fakeVV(844);
    const utils = render(<GameShell />);
    startRun(utils);
    expect(utils.getByTestId("pg2-rules").className).toContain("overflow-y-auto");
    expect(utils.getByTestId("pg2-stage-card").className).not.toContain("sticky");
    act(() => {
      vv.height = 450;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(utils.getByTestId("pg2-rules").className).not.toContain("overflow-y-auto");
    expect(utils.getByTestId("pg2-stage-card").className).toContain("sticky");
    act(() => {
      vv.height = 844;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(utils.getByTestId("pg2-rules").className).toContain("overflow-y-auto");
  });

  it("follows the active rule while the keyboard is open, not only when it opens", () => {
    vi.useFakeTimers();
    controllableMedia(false);
    const vv = fakeVV(844);
    const seen: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      seen.push(this);
    };
    const utils = render(<GameShell />);
    startRun(utils);
    act(() => {
      vv.height = 300;
      vv.dispatchEvent(new Event("resize"));
    });
    const first = utils.container.querySelector(".pg2-rule--active");
    expect(first).not.toBeNull();
    seen.length = 0;
    // The active rule moves on: the engine would repaint the class onto the next card.
    const next = document.createElement("div");
    next.className = "pg2-rule--active";
    first!.classList.remove("pg2-rule--active");
    first!.parentElement!.appendChild(next);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(seen).toContain(next);
  });

  it("keyboard mode compacts the HUD: the seed chip steps aside, the 44px controls stay", () => {
    controllableMedia(false);
    const vv = fakeVV(844);
    const utils = render(<GameShell />);
    startRun(utils);
    const seedChip = () => utils.getByRole("button", { name: /copy race link/i });
    expect(seedChip().className).not.toContain("hidden");
    act(() => {
      vv.height = 300;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(seedChip().className).toContain("hidden");
    expect(utils.getByRole("button", { name: /^exit/i }).className).toContain("min-h-11");
  });

  it("an armed Exit is announced to screen readers", () => {
    controllableMedia(false);
    const utils = render(<GameShell />);
    startRun(utils);
    const status = utils
      .getAllByRole("status")
      .find((el) => el.getAttribute("data-testid") !== "pg2-rule-announcer")!;
    expect(status.textContent).toBe("");
    fireEvent.click(utils.getByRole("button", { name: /^exit/i }));
    expect(status.textContent).toMatch(/tap exit again/i);
    expect(status.getAttribute("aria-live")).toBe("polite");
  });
});
