import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FailoverGame } from "../../failover";
import { FailoverController } from "../controller";
import type { FailoverScene } from "../scene/scene";
import { dispatch } from "../sim/action-log";
import { CONFIG } from "../sim/config";
import { S, resetSim } from "../sim/state";

// The mounted game with the WebGL scene stubbed out: the toolbar drives the
// controller, keys reach it only from the board, and unmounting releases it.

const scenes = vi.hoisted(() => ({
  made: 0,
  disposed: 0,
  broken: false,
  canvases: [] as HTMLCanvasElement[],
  lost: new Set<HTMLCanvasElement>(),
}));

// Like the real scene, a disposed scene forces its context lost, and a new
// renderer on that canvas cannot start (three throws reading "precision").
vi.mock("../scene/scene", () => ({
  createFailoverScene: (canvas: HTMLCanvasElement): FailoverScene => {
    if (scenes.lost.has(canvas)) throw new Error("the canvas has a lost context");
    scenes.made++;
    scenes.canvases.push(canvas);
    return {
      render: () => {
        if (scenes.broken) throw new Error("boom");
      },
      resize: () => undefined,
      setCamera: () => undefined,
      setOverlay: () => undefined,
      setTier: () => undefined,
      capture: () => null,
      pick: () => null,
      dispose: () => {
        scenes.disposed++;
        scenes.lost.add(canvas);
      },
    };
  },
}));

class NoopObserver {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  scenes.made = 0;
  scenes.disposed = 0;
  scenes.broken = false;
  scenes.canvases = [];
  scenes.lost.clear();
  window.localStorage.clear();
  // A returning player: the first-run coach (its own tests below) is done.
  window.localStorage.setItem("failover:coach", '{"v":1,"done":true}');
  vi.stubGlobal("ResizeObserver", NoopObserver);
  vi.stubGlobal("IntersectionObserver", NoopObserver);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetSim({ seed: "failover-game-reset" });
});

function mount() {
  render(<FailoverGame />);
}

describe("FailoverGame", () => {
  it("starts a run with the toolbar and the status line", () => {
    mount();
    expect(scenes.made).toBe(1);
    expect(screen.getByRole("button", { name: "Select (1)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("$500")).toBeInTheDocument();
    expect(screen.getByText("REPUTATION").nextElementSibling).toHaveTextContent("100%");
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Welcome, Architect!" })).toBeNull();
  });

  it("arms tools from the toolbar and services from the build palette", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Link (2)" }));
    expect(screen.getByRole("button", { name: "Link (2)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const waf = `${CONFIG.services.waf.name} $${CONFIG.services.waf.cost}`;
    fireEvent.click(screen.getByRole("button", { name: waf }));
    expect(screen.getByRole("button", { name: waf })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Link (2)" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("takes game keys on the board, and keeps the page from scrolling for them", () => {
    mount();
    const board = screen.getByLabelText(/Failover game board/);
    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    act(() => {
      board.dispatchEvent(space);
    });
    expect(space.defaultPrevented).toBe(true);
    expect(screen.getByRole("button", { name: "Resume (Space)" })).toBeInTheDocument();

    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => {
      board.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(false);
  });

  it("leaves keys typed into the toolbar alone", () => {
    mount();
    const pause = screen.getByRole("button", { name: "Pause (Space)" });
    const space = new KeyboardEvent("keydown", { key: "2", bubbles: true, cancelable: true });
    act(() => {
      pause.dispatchEvent(space);
    });
    expect(space.defaultPrevented).toBe(false);
    expect(screen.getByRole("button", { name: "Select (1)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("turns sound on and remembers it", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Sound on" }));
    expect(screen.getByRole("button", { name: "Sound off" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(window.localStorage.getItem("failover:audio")).toBe('{"v":1,"on":true}');
  });

  it("unlocks audio on the first pointerdown, once, so a stored 'on' preference plays", () => {
    const unlock = vi.spyOn(FailoverController.prototype, "unlockAudio");
    mount();
    expect(unlock).not.toHaveBeenCalled();
    const board = screen.getByLabelText(/Failover game board/);
    const canvas = board.querySelector("canvas") as HTMLCanvasElement;
    fireEvent.pointerDown(canvas, { pointerId: 1 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Pause (Space)" }), { pointerId: 2 });
    fireEvent.keyDown(board, { key: "q" });
    expect(unlock).toHaveBeenCalledTimes(1);
    unlock.mockRestore();
  });

  it("unlocks audio on the first keydown when the keyboard comes first", () => {
    const unlock = vi.spyOn(FailoverController.prototype, "unlockAudio");
    mount();
    const board = screen.getByLabelText(/Failover game board/);
    fireEvent.keyDown(board, { key: "e" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Pause (Space)" }), { key: "Enter" });
    expect(unlock).toHaveBeenCalledTimes(1);
    unlock.mockRestore();
  });

  it("shows the end of a run and starts a new one", () => {
    mount();
    expect(screen.queryByText("Run over")).toBeNull();
    act(() => {
      S.over = { reason: "money", atTick: 0 };
      fireEvent.click(screen.getByRole("button", { name: "Speed 2x" }));
    });
    expect(screen.getByText("Run over")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(screen.queryByText("Run over")).toBeNull();
    expect(S.over).toBeNull();
  });

  it("records a finished survival run on the device once, and the report shows the best", () => {
    const frames: ((t: number) => void)[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => frames.push(cb));
    mount();
    let t = 1000;
    const tick = (ms: number) =>
      act(() => {
        t += ms;
        frames.shift()?.(t);
      });
    tick(0);
    for (let i = 0; i < 40; i++) tick(50);
    act(() => {
      expect(dispatch({ op: 8 }).ok).toBe(true);
    });
    tick(50);
    tick(50);
    expect(JSON.parse(window.localStorage.getItem("failover:stats") ?? "null")).toMatchObject({
      v: 1,
      bestSeconds: 2,
      runs: 1,
    });
    expect(screen.getByRole("dialog", { name: "Run over" })).toHaveTextContent(
      "Best on this device: 0:02",
    );
  });

  it("shows no device best when a newer build's record refuses the write", () => {
    const newer = '{"v":2,"bestSeconds":900,"bestScore":99999,"runs":40,"streak":3}';
    window.localStorage.setItem("failover:stats", newer);
    const frames: ((t: number) => void)[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => frames.push(cb));
    mount();
    let t = 1000;
    const tick = (ms: number) =>
      act(() => {
        t += ms;
        frames.shift()?.(t);
      });
    tick(0);
    for (let i = 0; i < 40; i++) tick(50);
    act(() => {
      expect(dispatch({ op: 8 }).ok).toBe(true);
    });
    tick(50);
    expect(screen.getByRole("dialog", { name: "Run over" })).not.toHaveTextContent(
      "Best on this device",
    );
    expect(window.localStorage.getItem("failover:stats")).toBe(newer);
  });

  it("starts a first run paused under the coach, and a skip keeps it away", () => {
    window.localStorage.removeItem("failover:coach");
    mount();
    expect(screen.getByRole("region", { name: "Welcome, Architect!" })).toHaveTextContent(
      "Step 1 of 5",
    );
    expect(screen.getByRole("button", { name: "Resume (Space)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip Tutorial" }));
    expect(screen.queryByRole("region", { name: "Welcome, Architect!" })).toBeNull();
    expect(screen.getByRole("button", { name: "Pause (Space)" })).toBeInTheDocument();
    expect(window.localStorage.getItem("failover:coach")).toBe('{"v":1,"done":true}');
  });

  it("finishes the coach when the player starts the clock, and Settings brings it back", () => {
    window.localStorage.removeItem("failover:coach");
    const frames: ((t: number) => void)[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => frames.push(cb));
    mount();
    act(() => frames.shift()?.(1000));
    act(() => {
      for (const [type, x] of [
        ["waf", -28],
        ["compute", -16],
        ["db", -4],
      ] as const) {
        expect(dispatch({ op: 0, type, x, z: 0 }).ok).toBe(true);
      }
      expect(dispatch({ op: 1, from: "internet", to: "svc_1" }).ok).toBe(true);
    });
    // The next frame drains the placement events, and those redraw the HUD at once.
    act(() => frames.shift()?.(1016));
    expect(screen.getByRole("region", { name: "Welcome, Architect!" })).toHaveTextContent(
      "Step 5 of 5",
    );
    fireEvent.click(screen.getByRole("button", { name: "Resume (Space)" }));
    expect(screen.queryByRole("region", { name: "Welcome, Architect!" })).toBeNull();
    expect(window.localStorage.getItem("failover:coach")).toBe('{"v":1,"done":true}');

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Show the tour again/ }));
    expect(screen.queryByRole("region", { name: "Settings" })).toBeNull();
    expect(screen.getByRole("region", { name: "Welcome, Architect!" })).toHaveTextContent(
      "Step 1 of 5",
    );
    expect(screen.getByRole("button", { name: "Resume (Space)" })).toBeInTheDocument();
    expect(S.services).toHaveLength(0);
    expect(window.localStorage.getItem("failover:coach")).toBe('{"v":1,"done":false}');
  });

  it("shows the crash card when the loop stops on an error", () => {
    vi.stubGlobal("reportError", () => undefined);
    const frames: ((t: number) => void)[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => frames.push(cb));
    mount();
    expect(screen.queryByText("Game Error")).toBeNull();
    scenes.broken = true;
    act(() => {
      frames.shift()?.(1000);
    });
    expect(screen.getByText("Game Error")).toBeInTheDocument();
    expect(screen.getByText("This game hit an error and stopped.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("gives each mount its own canvas, so a StrictMode remount gets a live context", () => {
    render(
      <StrictMode>
        <FailoverGame />
      </StrictMode>,
    );
    expect(scenes.made).toBe(2);
    const [first, second] = scenes.canvases as [HTMLCanvasElement, HTMLCanvasElement];
    expect(first).not.toBe(second);
    expect(scenes.lost.has(first)).toBe(true);
    expect(first.isConnected).toBe(false);
    expect(second.isConnected).toBe(true);
    expect(scenes.lost.has(second)).toBe(false);
    expect(screen.getByRole("button", { name: "Select (1)" })).toBeInTheDocument();
  });

  it("releases the scene on unmount", () => {
    mount();
    cleanup();
    expect(scenes.disposed).toBe(1);
  });
});
