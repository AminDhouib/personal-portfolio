import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import type { GameState, Pg2Rule } from "../../engine/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

const cues: string[] = [];
const unlock = vi.fn();
vi.mock("../../sound/motifs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../sound/motifs")>();
  return { ...actual, playCue: (name: string) => cues.push(name) };
});
vi.mock("../../sound/audio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../sound/audio")>();
  return { ...actual, unlockAudio: () => unlock() };
});

// Wrap createRun to capture the live GameState and add a rule that passes only while
// the password is empty: any keystroke reopens it, backspacing back to empty recovers it.
let live: GameState | null = null;
vi.mock("../../engine/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../engine/engine")>();
  const emptyRule: Pg2Rule = {
    id: "test-empty",
    act: "prologue",
    description: "Test empty rule.",
    validate: (password: string) => ({ passed: password === "" }),
  };
  return {
    ...actual,
    createRun: (opts: Parameters<typeof actual.createRun>[0]): GameState => {
      const g = actual.createRun(opts);
      g.rules = [...g.rules, emptyRule];
      live = g;
      return g;
    },
  };
});

import { GameShell } from "../game-shell";

const ticks = () => cues.filter((c) => c === "key-tick").length;

function startRun() {
  const utils = render(<GameShell />);
  fireEvent.click(utils.getByRole("button", { name: /random seed/i }));
  return utils;
}

describe("GameShell motion and sound wiring", () => {
  beforeEach(() => {
    cues.length = 0;
    unlock.mockClear();
    live = null;
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => 0);
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

  it("the Start tap unlocks audio before the run exists", () => {
    const { getByRole } = render(<GameShell />);
    expect(unlock).not.toHaveBeenCalled();
    fireEvent.click(getByRole("button", { name: /random seed/i }));
    expect(unlock).toHaveBeenCalled();
  });

  it("typing fast plays at most one tick per 30ms", async () => {
    startRun();
    for (const k of "abcdef") fireEvent.keyDown(document.body, { key: k });
    expect(ticks()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    fireEvent.keyDown(document.body, { key: "g" });
    expect(ticks()).toBe(2);
  });

  it("a key aimed at a control is not a tick", () => {
    const { getByRole } = startRun();
    fireEvent.keyDown(getByRole("button", { name: /create account/i }), { key: " " });
    expect(ticks()).toBe(0);
  });

  it("revealing a rule plays the reveal cue", () => {
    startRun();
    expect(cues).toContain("rule-reveal");
    cues.length = 0;
    act(() => {
      live!.rules = [
        ...live!.rules,
        {
          id: "test-extra",
          act: "prologue",
          description: "Extra.",
          validate: () => ({ passed: false }),
        },
      ];
      vi.advanceTimersByTime(1500); // the heartbeat re-renders the shell
    });
    expect(cues.filter((c) => c === "rule-reveal")).toHaveLength(1);
  });

  it("a regression plays the fail cue and a recovery plays the pass cue", () => {
    startRun();
    cues.length = 0;
    fireEvent.keyDown(document.body, { key: "a" });
    expect(cues).toContain("rule-fail");
    expect(cues).not.toContain("rule-pass");
    cues.length = 0;
    fireEvent.keyDown(document.body, { key: "Backspace" });
    expect(cues).toContain("rule-pass");
  });

  it("the regressed card names the event that is live", () => {
    const { getByTestId } = startRun();
    act(() => {
      live!.events = [
        ...live!.events,
        {
          defId: "infection",
          family: "force",
          act: "prologue",
          phase: "peak",
          phaseElapsedMs: 0,
          scheduledAtMs: 0,
          data: {},
        },
      ];
    });
    fireEvent.keyDown(document.body, { key: "a" });
    const card = getByTestId("pg2-rules").querySelector(
      '[data-flip-id="test-empty"]',
    ) as HTMLElement;
    expect(within(card).getByText("Reopened while the infection is active")).toBeTruthy();
  });

  it("a finished event is not blamed", () => {
    const { getByTestId } = startRun();
    act(() => {
      live!.events = [
        ...live!.events,
        {
          defId: "infection",
          family: "force",
          act: "prologue",
          phase: "done",
          phaseElapsedMs: 0,
          scheduledAtMs: 0,
          data: {},
        },
      ];
    });
    fireEvent.keyDown(document.body, { key: "a" });
    const card = getByTestId("pg2-rules").querySelector(
      '[data-flip-id="test-empty"]',
    ) as HTMLElement;
    expect(within(card).getByText("Your last edit broke this rule")).toBeTruthy();
  });
});
