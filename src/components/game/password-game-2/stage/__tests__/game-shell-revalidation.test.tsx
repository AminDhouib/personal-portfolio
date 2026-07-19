import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { GameState, Pg2Rule, RuleApi, ValidationResult } from "../../engine/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

// Wrap createRun to inject a rule that flips purely on the wall clock: it passes
// at exactly 12:00 and fails otherwise, reporting the current HH:MM. Nothing else
// about the run changes, so the only thing that can move its badge is a
// re-validation — which is exactly what the 1s tick provides.
vi.mock("../../engine/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../engine/engine")>();
  const wallClockRule: Pg2Rule = {
    id: "test-wall-clock",
    act: "prologue",
    description: "Test wall-clock rule.",
    validate: (_password: string, _state: GameState, api: RuleApi): ValidationResult => {
      const t = api.nowHHMM();
      return { passed: t === "12:00", message: t };
    },
  };
  return {
    ...actual,
    createRun: (opts: Parameters<typeof actual.createRun>[0]): GameState => {
      const g = actual.createRun(opts);
      g.rules = [...g.rules, wallClockRule];
      return g;
    },
  };
});

import { GameShell } from "../game-shell";

/**
 * The rule list re-validates on a >=1Hz tick, so a rule that flips from pure
 * elapsed time (a coupled rule going red, the current-time clock) updates on
 * screen even when nothing else in the engine moves. rAF is frozen here, so
 * g.version never bumps and no keystroke fires — the 1s tick is the ONLY thing
 * that can re-render the list. This is the on-screen drama the tick protects.
 */
describe("GameShell rule-list re-validation tick", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Our stubs win over any rAF the fake timers would install: the frame loop
    // gets a no-op, so it never ticks and never bumps g.version.
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

  it("re-validates a time-driven rule on the 1s tick with no engine activity", () => {
    vi.setSystemTime(new Date(2020, 0, 1, 12, 0, 30)); // 12:00:30 — the rule passes
    const { getByRole, getByText, queryByText } = render(<GameShell />);
    fireEvent.click(getByRole("button", { name: /random seed/i }));

    // The rule is on screen and, at 12:00, satisfied — its failing "HH:MM"
    // message is not shown.
    expect(getByText("Test wall-clock rule.")).toBeTruthy();
    expect(queryByText("12:01")).toBeNull();

    // Cross the minute boundary. No keystroke and the frame loop is frozen, so
    // g.version cannot bump — only the 1s re-validation interval fires. The rule
    // must now read as failing, showing the new clock value.
    act(() => {
      vi.advanceTimersByTime(40_000); // -> 12:01:10
    });

    expect(queryByText("12:01")).not.toBeNull();
  });
});
