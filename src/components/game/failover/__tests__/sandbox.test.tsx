import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FailoverGame } from "../../failover";
import type { FailoverScene } from "../scene/scene";
import { dispatch } from "../sim/action-log";
import { CONFIG } from "../sim/config";
import { S, resetSim } from "../sim/state";

// Sandbox, from Settings: a big budget and no failure, no score, no device
// record and nothing ranked, labelled as Sandbox wherever the run shows.

vi.mock("../scene/scene", () => ({
  createFailoverScene: (): FailoverScene => ({
    render: () => undefined,
    resize: () => undefined,
    setCamera: () => undefined,
    setOverlay: () => undefined,
    setTier: () => undefined,
    pick: () => null,
    dispose: () => undefined,
  }),
}));

class NoopObserver {
  observe() {}
  disconnect() {}
}

let frames: ((t: number) => void)[] = [];
let now = 1000;

beforeEach(() => {
  frames = [];
  now = 1000;
  window.localStorage.clear();
  window.localStorage.setItem("failover:coach", '{"v":1,"done":true}');
  vi.stubGlobal("ResizeObserver", NoopObserver);
  vi.stubGlobal("IntersectionObserver", NoopObserver);
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetSim({ seed: "sandbox-reset" });
});

function tick(ms: number) {
  act(() => {
    now += ms;
    frames.shift()?.(now);
  });
}

function startSandbox() {
  render(<FailoverGame />);
  tick(0);
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Start a Sandbox run" }));
  tick(16);
}

describe("Sandbox", () => {
  it("starts from Settings with the Sandbox budget, labelled, and with no score", () => {
    startSandbox();
    expect(S.gameMode).toBe("sandbox");
    expect(screen.queryByRole("region", { name: "Settings" })).toBeNull();
    const status = screen.getByText("BUDGET").closest("dl")!;
    expect(status).toHaveTextContent(`$${CONFIG.sandbox.defaultBudget.toLocaleString("en-US")}`);
    expect(within(status).getByText("SANDBOX")).toBeInTheDocument();
    expect(within(status).queryByText("TOTAL SCORE")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Start a Survival run" }));
    expect(S.gameMode).toBe("survival");
    expect(screen.queryByText("SANDBOX")).toBeNull();
  });

  it("does not fail: no money and no reputation still leave the run going", () => {
    startSandbox();
    act(() => {
      S.money = -1_000_000;
      S.reputation = 0;
    });
    for (let i = 0; i < 100; i++) tick(50);
    expect(S.tick).toBeGreaterThan(50);
    expect(S.over).toBeNull();
    expect(screen.queryByRole("dialog", { name: /Run over/ })).toBeNull();
  });

  it("ends only when retired, shows no score and no device best, and records nothing", () => {
    const before = '{"v":1,"bestSeconds":61,"bestScore":900,"runs":2,"lastDailyDay":null}';
    window.localStorage.setItem("failover:stats", before);
    startSandbox();
    for (let i = 0; i < 40; i++) tick(50);
    act(() => {
      expect(dispatch({ op: 8 }).ok).toBe(true);
    });
    tick(50);
    const report = screen.getByRole("dialog", { name: /Run over/ });
    expect(report).toHaveTextContent("Sandbox Mode");
    expect(report).not.toHaveTextContent("Final Score");
    expect(report).not.toHaveTextContent("Best on this device");
    expect(window.localStorage.getItem("failover:stats")).toBe(before);
  });
});
