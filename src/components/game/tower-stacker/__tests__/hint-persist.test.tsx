import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freeSeed } from "../daily";

const realGetContext =
  Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext") ?? {};
let clock = 0;
const HINT = /Land it dead centre for a perfect/;

function fakeCanvasContext() {
  return new Proxy(
    {},
    {
      get: (_target, prop) => (prop === "measureText" ? () => ({ width: 10 }) : () => undefined),
      set: () => true,
    },
  );
}

// The in-memory "hint dismissed" flag lives at module level, so each test loads a fresh Stage.
async function freshStage() {
  vi.resetModules();
  return (await import("../stage")).Stage;
}

beforeEach(() => {
  clock = 1000;
  window.localStorage.clear();
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    value: () => fakeCanvasContext(),
    configurable: true,
    writable: true,
  });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  cleanup();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", realGetContext);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("the first-run hint", () => {
  it("shows on a clean device and is remembered after the first landing", async () => {
    const Stage = await freshStage();
    const engine = await import("../engine");
    render(<Stage seedText="e2e" />);
    expect(screen.getByText(HINT)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    const run = engine.newRun(freeSeed("e2e"), clock);
    clock = engine.perfectDropTime(run, clock);
    fireEvent.pointerDown(screen.getByTestId("tower-hit-layer"));
    expect(screen.getByTestId("tower-stage").dataset.floors).toBe("1");
    expect(JSON.parse(window.localStorage.getItem("tower:stats") ?? "{}").seenHint).toBe(true);
  });

  it("stays hidden on a device that already dismissed it", async () => {
    window.localStorage.setItem(
      "tower:stats",
      JSON.stringify({
        v: 1,
        bestFree: 0,
        bestDaily: null,
        runs: 0,
        lastDailyDay: null,
        streakDays: 0,
        bestStreakDays: 0,
        seenHint: true,
        handle: "",
      }),
    );
    const Stage = await freshStage();
    render(<Stage seedText="e2e" />);
    expect(screen.queryByText(HINT)).toBeNull();
  });
});
