import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRefs, startRun } from "../run-init";
import { runTick } from "../game-tick";
import type { GameRefs, Viewport } from "../types";

// Smoke-level characterization for runTick: build the smallest valid live state
// via the run-init helpers, drive a handful of ticks with fixed inputs, and pin
// the invariants that must hold regardless of the (randomized) spawn/AI paths --
// no throw, time advances, and the key numeric fields never go NaN/Infinity.
// This deliberately does NOT assert on rendering or exact spawn counts; those
// depend on Math.random and are out of scope for a smoke test.

const VIEWPORT: Viewport = { width: 1200, height: 700 };

function stubMatchMedia(): void {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

// The numeric ship/run fields that must stay finite for the loop to be sane.
function assertFinite(g: GameRefs): void {
  const fields: Array<keyof GameRefs> = [
    "now",
    "distance",
    "score",
    "kills",
    "combo",
    "shipX",
    "shipY",
    "shipZ",
    "shipRotZ",
    "nextBiomeAt",
    "nextWallAt",
  ];
  for (const key of fields) {
    const v = g[key] as number;
    expect(Number.isFinite(v), `${String(key)} should be finite, got ${v}`).toBe(true);
  }
}

describe("runTick smoke", () => {
  beforeEach(() => {
    stubMatchMedia();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("advances several ticks on a live run without throwing", () => {
    const g = createRefs();
    startRun(g);

    // Advance a virtual clock so `performance.now()` moves forward across ticks
    // (difficulty/spawn timers key off it). Start at the run's startedAt.
    let clock = g.startedAt;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock);

    expect(() => {
      for (let i = 0; i < 20; i++) {
        clock += 16; // ~60fps
        runTick(
          g,
          0.016,
          VIEWPORT,
          () => {},
          () => {},
        );
      }
    }).not.toThrow();

    spy.mockRestore();

    expect(g.status).toBe("playing"); // no death expected from empty inputs
    assertFinite(g);
    // now is synced to the (stubbed) clock each tick.
    expect(g.now).toBe(g.startedAt + 20 * 16);
  });

  it("keeps ship coordinates finite while it steers toward a moving target", () => {
    const g = createRefs();
    startRun(g);
    let clock = g.startedAt;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock);

    for (let i = 0; i < 30; i++) {
      clock += 16;
      // Wiggle the target so the steering integration runs both directions.
      g.targetX = i % 2 === 0 ? 3 : -3;
      g.targetY = i % 2 === 0 ? -2 : 2;
      runTick(
        g,
        0.016,
        VIEWPORT,
        () => {},
        () => {},
      );
      assertFinite(g);
    }

    spy.mockRestore();
    expect(Number.isNaN(g.shipX)).toBe(false);
    expect(Number.isNaN(g.shipY)).toBe(false);
  });

  it("tolerates a large dt by clamping the physics step (no explosion to NaN)", () => {
    const g = createRefs();
    startRun(g);
    let clock = g.startedAt;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock);

    // Pass an absurd dt (2 seconds); runTick clamps step to <= 0.05 internally.
    expect(() => {
      clock += 2000;
      runTick(
        g,
        2,
        VIEWPORT,
        () => {},
        () => {},
      );
    }).not.toThrow();

    spy.mockRestore();
    assertFinite(g);
  });

  it("does not advance simulation while paused", () => {
    const g = createRefs();
    startRun(g);
    g.status = "paused";
    const distanceBefore = g.distance;

    let clock = g.startedAt;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock);
    expect(() => {
      for (let i = 0; i < 5; i++) {
        clock += 16;
        runTick(
          g,
          0.016,
          VIEWPORT,
          () => {},
          () => {},
        );
      }
    }).not.toThrow();
    spy.mockRestore();

    // Distance accrues only while 'playing'; paused ticks must not move it.
    expect(g.distance).toBe(distanceBefore);
    expect(g.status).toBe("paused");
  });
});
