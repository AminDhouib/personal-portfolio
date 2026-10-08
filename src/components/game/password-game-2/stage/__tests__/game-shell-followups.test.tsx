import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import type { GameState } from "../../engine/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

// Capture the live GameState so a test can bump its version the way an event would.
const live: { g: GameState | null } = { g: null };
vi.mock("../../engine/engine", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/engine")>();
  return {
    ...orig,
    createRun: (opts: Parameters<typeof orig.createRun>[0]) => {
      live.g = orig.createRun(opts);
      return live.g;
    },
  };
});

// A canvas overlay whose hit test always reports a galaga alien: the worst case, with the
// fleet sitting over every control in the HUD row.
vi.mock("../canvas-overlay", () => ({
  CanvasOverlay: forwardRef(function FleetEverywhere(_props, ref) {
    useImperativeHandle(ref, () => ({
      paint: () => {},
      hitTest: () => ({ kind: "alien", id: 1 }) as const,
    }));
    return null;
  }),
}));

import { GameShell } from "../game-shell";

function phoneMedia() {
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
}

function fakeVV(height: number) {
  const vv = Object.assign(new EventTarget(), { height, offsetTop: 0, width: 390, scale: 1 });
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  return vv;
}

describe("GameShell follow-ups", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    phoneMedia();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    live.g = null;
    Reflect.deleteProperty(window, "visualViewport");
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    document.documentElement.classList.remove("pg2-lock");
  });

  it("an event bumping the version does not snap the view back to the caret", () => {
    vi.useFakeTimers();
    const vv = fakeVV(844);
    const seen: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      seen.push(this);
    };
    const { getByRole } = render(<GameShell />);
    fireEvent.click(getByRole("button", { name: /random seed/i }));
    act(() => {
      vv.height = 300;
      vv.dispatchEvent(new Event("resize"));
    });
    const caretReveals = () => seen.filter((el) => el.classList.contains("pg2-caret")).length;

    // Typing reveals the caret.
    fireEvent.keyDown(document.body, { key: "a" });
    expect(caretReveals()).toBeGreaterThan(0);

    // An event (infection, say) bumps the version while the player reads the rules.
    seen.length = 0;
    live.g!.version += 1;
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(caretReveals()).toBe(0);
  });

  it("a canvas hit over a HUD control does not swallow the tap", () => {
    const { getByRole } = render(<GameShell />);
    fireEvent.click(getByRole("button", { name: /random seed/i }));
    const sound = getByRole("button", { name: /mute sound|enable sound/i });
    const before = sound.getAttribute("aria-pressed");
    // Not cancelled: the capture-phase canvas hit test must leave a button alone.
    expect(fireEvent.pointerDown(sound)).toBe(true);
    fireEvent.click(sound);
    expect(sound.getAttribute("aria-pressed")).not.toBe(before);

    const exit = getByRole("button", { name: /^exit/i });
    expect(fireEvent.pointerDown(exit)).toBe(true);
  });

  it("a canvas hit on the password area is still consumed", () => {
    const { getByRole } = render(<GameShell />);
    fireEvent.click(getByRole("button", { name: /random seed/i }));
    expect(fireEvent.pointerDown(getByRole("textbox", { name: "Password" }))).toBe(false);
  });

  it("the HUD row is stacked above the canvas layer, so the fleet cannot paint over it", () => {
    const { getByRole, getByTestId } = render(<GameShell />);
    fireEvent.click(getByRole("button", { name: /random seed/i }));
    expect(getByTestId("pg2-hud").className).toMatch(/\brelative\b/);
    expect(getByTestId("pg2-hud").className).toContain("z-30");
  });
});
