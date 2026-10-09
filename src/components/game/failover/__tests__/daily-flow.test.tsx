import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ peek: vi.fn(), get: vi.fn(), reset: vi.fn() }));
vi.mock("@/lib/arcade/identity", () => ({
  peekIdentity: identity.peek,
  getIdentity: identity.get,
  resetIdentity: identity.reset,
}));

import { utcDayKey } from "@/lib/arcade/boards";
import type { HudState } from "../controller";
import { dispatch } from "../sim/action-log";
import { resetSim } from "../sim/state";
import { EMPTY_STATS } from "../stats";
import { DailyStart } from "../ui/daily-start";
import { Report } from "../ui/report";
import { createHudBridge, useHud } from "../ui/use-hud";
import { makeController } from "./ui-harness";

// The Daily Incident through the screens: starting it, the board on its report, and the runs
// that must never reach the board (a free run, a sandbox run, a run begun any other way).

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ game: "failover", board: "daily", entries: [], you: null }), {
      status: 200,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("reportError", vi.fn());
  identity.get.mockReset().mockReturnValue({ playerId: "p", token: "t" });
  identity.peek.mockReset().mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetSim({ seed: "daily-flow-reset" });
});

const posts = () =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");

function mountGame(mode: "sandbox" | "survival") {
  const h = makeController({ mode });
  const bridge = createHudBridge();
  const onStarted = vi.fn();
  function Host() {
    const hud: HudState | null = useHud(bridge);
    if (!hud) return null;
    return (
      <>
        <DailyStart hud={hud} controller={h.controller} onStarted={onStarted} />
        <Report hud={hud} best={EMPTY_STATS} onPlayAgain={() => h.controller.restart()} />
      </>
    );
  }
  render(<Host />);
  h.controller.start();
  act(() => bridge.connect(h.controller));
  act(() => h.frame(16));
  return { ...h, onStarted };
}

/** End the run now, the way the sim ends a retired run. */
function endRun(h: ReturnType<typeof mountGame>) {
  act(() => {
    dispatch({ op: 8 });
    h.frame(50);
  });
}

const startButton = () => screen.getByRole("button", { name: "Play today's Daily Incident" });

describe("starting the daily", () => {
  it("starts today's incident at once on a fresh board", () => {
    const h = mountGame("sandbox");
    fireEvent.click(startButton());
    expect(h.controller.getHud().daily).toMatchObject({ day: utcDayKey(new Date()), result: null });
    expect(h.onStarted).toHaveBeenCalledTimes(1);
  });

  it("asks before it replaces a run that is under way, and Cancel keeps that run", () => {
    const h = mountGame("sandbox");
    act(() => {
      h.frame(300);
      h.frame(300);
    });
    expect(h.controller.getHud().time).toBeGreaterThan(0);
    fireEvent.click(startButton());
    expect(screen.getByText("Start today's incident? This run ends.")).toBeTruthy();
    expect(h.controller.getHud().daily).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.controller.getHud().daily).toBeNull();
    fireEvent.click(startButton());
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(h.controller.getHud().daily?.day).toBe(utcDayKey(new Date()));
  });
});

describe("the board on the report", () => {
  it("opens for a finished daily: one read, and no post until Submit", () => {
    const h = mountGame("sandbox");
    fireEvent.click(startButton());
    endRun(h);
    expect(screen.getByTestId("failover-daily-panel")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(posts()).toHaveLength(0);
  });
});

describe("runs that never reach the board", () => {
  for (const mode of ["sandbox", "survival"] as const) {
    it(`a free ${mode} run shows no board and touches no network`, () => {
      const h = mountGame(mode);
      endRun(h);
      expect(h.controller.getHud().over).toBe("retired");
      expect(screen.queryByTestId("failover-daily-panel")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("Play again after a daily is a free run: no board, no new read", () => {
    const h = mountGame("survival");
    fireEvent.click(startButton());
    endRun(h);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => h.controller.restart());
    endRun(h);
    expect(h.controller.getHud().daily).toBeNull();
    expect(screen.queryByTestId("failover-daily-panel")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(posts()).toHaveLength(0);
  });

  it("a loaded save or an imported blueprint (replaceRun) leaves no board and no POST", async () => {
    const h = mountGame("survival");
    fireEvent.click(startButton());
    await act(async () => {
      await h.controller.replaceRun(() => {
        resetSim({ seed: "a-loaded-run", mode: "survival" });
      });
    });
    expect(h.controller.getHud().daily).toBeNull();
    endRun(h);
    expect(h.controller.getHud().over).toBe("retired");
    expect(screen.queryByTestId("failover-daily-panel")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("switching to Sandbox from a daily leaves no board and no POST", () => {
    const h = mountGame("survival");
    fireEvent.click(startButton());
    act(() => h.controller.restart(undefined, "sandbox"));
    expect(h.controller.getHud().mode).toBe("sandbox");
    endRun(h);
    expect(screen.queryByTestId("failover-daily-panel")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a run begun any other way than the daily start (a loaded save, an arch link) carries no result", () => {
    const h = mountGame("survival");
    fireEvent.click(startButton());
    // A loader starts its run with restart(seed), which drops the daily.
    act(() => h.controller.restart("a-loaded-run"));
    expect(h.controller.getHud().daily).toBeNull();
    endRun(h);
    expect(screen.queryByTestId("failover-daily-panel")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
