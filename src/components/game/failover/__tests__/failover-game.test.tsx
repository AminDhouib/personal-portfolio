import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FailoverGame } from "../../failover";
import type { FailoverScene } from "../scene/scene";
import { S, resetSim } from "../sim/state";

// The mounted game with the WebGL scene stubbed out: the toolbar drives the
// controller, keys reach it only from the board, and unmounting releases it.

const scenes = vi.hoisted(() => ({ made: 0, disposed: 0 }));

vi.mock("../scene/scene", () => ({
  createFailoverScene: (): FailoverScene => {
    scenes.made++;
    return {
      render: () => undefined,
      resize: () => undefined,
      setCamera: () => undefined,
      setOverlay: () => undefined,
      setTier: () => undefined,
      pick: () => null,
      dispose: () => {
        scenes.disposed++;
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
  window.localStorage.clear();
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
    expect(screen.getByText("Rep 100%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sound on" })).toBeInTheDocument();
  });

  it("arms tools from the toolbar and the build menu", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Link (2)" }));
    expect(screen.getByRole("button", { name: "Link (2)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.change(screen.getByLabelText("Build a service"), { target: { value: "waf" } });
    expect(screen.getByLabelText("Build a service")).toHaveValue("waf");
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
    fireEvent.click(screen.getByRole("button", { name: "Sound on" }));
    expect(screen.getByRole("button", { name: "Sound off" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(window.localStorage.getItem("failover:audio")).toBe('{"v":1,"on":true}');
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

  it("releases the scene on unmount", () => {
    mount();
    cleanup();
    expect(scenes.disposed).toBe(1);
  });
});
