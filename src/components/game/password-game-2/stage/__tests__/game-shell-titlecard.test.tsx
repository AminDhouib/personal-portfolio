import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { GameState } from "../../engine/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

// Capture the live GameState so a test can queue the engine's title-card effects.
let live: GameState | null = null;
vi.mock("../../engine/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../engine/engine")>();
  return {
    ...actual,
    createRun: (opts: Parameters<typeof actual.createRun>[0]): GameState => {
      live = actual.createRun(opts);
      return live;
    },
  };
});

import { GameShell } from "../game-shell";

// One frame of the shell's rAF loop on demand: the loop drains engine effects there.
let frame: FrameRequestCallback | null = null;
function runFrame(ts: number) {
  act(() => {
    const cb = frame;
    frame = null;
    cb?.(ts);
  });
}

const card = () => document.querySelector<HTMLElement>(".pg2-titlecard");

describe("GameShell act title card", () => {
  beforeEach(() => {
    live = null;
    frame = null;
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frame = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
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
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function startRun() {
    const utils = render(<GameShell />);
    fireEvent.click(utils.getByRole("button", { name: /random seed/i }));
    live!.effects.length = 0;
    return utils;
  }

  it("wipes in carrying its act, and is gone after its 2.2 s", async () => {
    startRun();
    live!.effects.push({ kind: "title-card", act: "act1" });
    runFrame(16);
    expect(card()).not.toBeNull();
    expect(card()!.getAttribute("data-act")).toBe("act1");
    expect(card()!.className).toContain("pg2-titlecard-wipe");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_300);
    });
    expect(card()).toBeNull();
  });

  it("a queued card is a fresh element, so its wipe plays from the start", async () => {
    startRun();
    live!.effects.push({ kind: "title-card", act: "act1" }, { kind: "title-card", act: "act2" });
    runFrame(16);
    const first = card()!;
    expect(first.getAttribute("data-act")).toBe("act1");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_250);
    });
    const second = card()!;
    expect(second.getAttribute("data-act")).toBe("act2");
    expect(second).not.toBe(first);
    expect(second.className).toContain("pg2-titlecard-wipe");
  });
});
