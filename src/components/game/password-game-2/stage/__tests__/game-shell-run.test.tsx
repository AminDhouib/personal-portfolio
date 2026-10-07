import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { GameState } from "../../engine/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("seed=7"),
}));

// Capture the live GameState the shell creates, and pin its clock so the rules that read
// the time agree with the driver's. The shell is otherwise the real one.
const live: { g: GameState | null } = { g: null };
vi.mock("../../engine/engine", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/engine")>();
  return {
    ...orig,
    createRun: (opts: Parameters<typeof orig.createRun>[0]) => {
      live.g = orig.createRun({ ...opts, nowHHMM: () => "12:00" });
      return live.g;
    },
  };
});

import { GameShell } from "../game-shell";
import { drainEffects } from "../../engine/effects";
import { cellsToPassword } from "../../engine/cells";
import { makeRuleApi, requestSubmit } from "../../engine/engine";
import { CORE_RULES } from "../../engine/rules/index";
import { HHMM, coreRevealed, nonInhabDone, solveAndTick } from "../../engine/__tests__/drive";

const isDesktop = (q: string) => q.includes("min-width: 1024px");

/**
 * The CI acceptance run for the stage: the shell, rendered for real on a desktop viewport,
 * is driven through a whole seeded run by the shared engine driver. It proves the stage
 * card survives every act boundary and that the submit gate opens the finale stage.
 */
describe("GameShell full seeded run", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => 0); // the driver, not the frame loop, ticks
    vi.stubGlobal("cancelAnimationFrame", () => {});
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: isDesktop(query),
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
    live.g = null;
    document.documentElement.classList.remove("pg2-lock");
  });

  it("reaches act 3 and the finale with the stage card on screen throughout", () => {
    const { getByRole, getByTestId } = render(<GameShell />);
    fireEvent.click(getByRole("button", { name: /start seed 7/i }));
    const g = live.g!;
    const api = makeRuleApi(g, () => HHMM);

    // Let the heartbeat (250ms) repaint the shell from the driver's mutations.
    const pump = () => {
      act(() => {
        vi.advanceTimersByTime(300);
      });
    };

    const seen: string[] = [g.act];
    const step = () => {
      const before = g.act;
      solveAndTick(g, api);
      drainEffects(g);
      if (g.act !== before) {
        seen.push(g.act);
        pump();
        expect(getByTestId("pg2-stage-card")).toBeTruthy();
      }
    };

    for (let i = 0; i < 6000 && g.act !== "act3"; i++) step();
    expect(g.act).toBe("act3");

    // Stay in act3 until the full core roster passes and every blocking beat resolved.
    for (let i = 0; i < 4000; i++) {
      step();
      const pw = cellsToPassword(g.cells);
      if (
        coreRevealed(g) === CORE_RULES.length &&
        g.rules.every((r) => r.validate(pw, g, api).passed) &&
        nonInhabDone(g, "act3")
      ) {
        break;
      }
    }
    pump();
    expect(getByTestId("pg2-stage-card")).toBeTruthy();
    expect(getByTestId("pg2-rules")).toBeTruthy();

    requestSubmit(g);
    drainEffects(g);
    pump();

    expect(seen).toEqual(expect.arrayContaining(["prologue", "act1", "act2", "act3"]));
    expect(g.act).toBe("finale");
    expect(getByTestId("pg2-stage-card")).toBeTruthy();
    expect(getByTestId("pg2-finale")).toBeTruthy();
  });
});
