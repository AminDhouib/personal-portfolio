import { describe, it, expect } from "vitest";
import {
  COUNT_UP_MS,
  NO_FIT,
  RESTART_LOCKOUT_MS,
  boardFit,
  countUpValue,
  gameOverView,
} from "../game-over";

const view = (over: Partial<Parameters<typeof gameOverView>[0]> = {}) =>
  gameOverView({ score: 500, previousBest: 300, side: 2, nowMs: 0, overAtMs: 0, ...over });

describe("gameOverView", () => {
  it("calls a run that beats the stored best a new best", () => {
    expect(view({ score: 500, previousBest: 300 }).isNewBest).toBe(true);
    expect(view({ score: 500, previousBest: 300 }).isFirstRun).toBe(false);
  });

  it("does not call a tie or a lower score a new best", () => {
    expect(view({ score: 300, previousBest: 300 }).isNewBest).toBe(false);
    expect(view({ score: 200, previousBest: 300 }).isNewBest).toBe(false);
  });

  it("does not call the first run ever a new best (no best stored yet)", () => {
    const first = view({ score: 500, previousBest: null });
    expect(first.isFirstRun).toBe(true);
    expect(first.isNewBest).toBe(false);
  });

  it("never calls a 0 a new best", () => {
    expect(view({ score: 0, previousBest: null }).isNewBest).toBe(false);
  });

  it("passes the overflowed side through", () => {
    expect(view({ side: 4 }).side).toBe(4);
  });

  it("counts up from 0 to the score by COUNT_UP_MS, easing out", () => {
    expect(COUNT_UP_MS).toBe(900);
    expect(view({ nowMs: 0 }).countUpValue).toBe(0);
    const half = view({ nowMs: COUNT_UP_MS / 2 }).countUpValue;
    // Ease-out: past the halfway value at half time, still short of the score.
    expect(half).toBeGreaterThan(250);
    expect(half).toBeLessThan(500);
    expect(view({ nowMs: COUNT_UP_MS - 1 }).countUpValue).toBeLessThanOrEqual(500);
    expect(view({ nowMs: COUNT_UP_MS }).countUpValue).toBe(500);
    expect(view({ nowMs: 5000 }).countUpValue).toBe(500);
  });

  it("never counts down or past the score", () => {
    let last = -1;
    for (let t = 0; t <= COUNT_UP_MS; t += 30) {
      const v = countUpValue(12345, t);
      expect(v).toBeGreaterThanOrEqual(last);
      expect(v).toBeLessThanOrEqual(12345);
      expect(Number.isInteger(v)).toBe(true);
      last = v;
    }
    expect(countUpValue(12345, -50)).toBe(0);
  });

  it("locks restart for RESTART_LOCKOUT_MS after game over", () => {
    expect(RESTART_LOCKOUT_MS).toBe(1200);
    expect(view({ overAtMs: 1000, nowMs: 1000 }).canRestart).toBe(false);
    expect(view({ overAtMs: 1000, nowMs: 2199 }).canRestart).toBe(false);
    expect(view({ overAtMs: 1000, nowMs: 2200 }).canRestart).toBe(true);
  });
});

describe("boardFit", () => {
  it("lifts and shrinks the board into the space above a phone's bottom sheet", () => {
    const fit = boardFit({ w: 390, h: 844 }, { x: 0, y: 380, w: 390, h: 464 });
    expect(fit.scale).toBeCloseTo(380 / 390);
    expect(fit.dx).toBe(0);
    expect(fit.dy).toBe(190 - 422);
  });

  it("moves the board left of a desktop side panel", () => {
    const fit = boardFit({ w: 900, h: 630 }, { x: 580, y: 0, w: 320, h: 630 });
    expect(fit.scale).toBeCloseTo(580 / 630);
    expect(fit.dx).toBe(290 - 450);
    expect(fit.dy).toBe(0);
  });

  it("never grows the board", () => {
    const fit = boardFit({ w: 1200, h: 600 }, { x: 880, y: 0, w: 320, h: 600 });
    expect(fit.scale).toBe(1);
    expect(fit.dx).toBe(440 - 600);
  });

  it("leaves the board alone when the sheet is outside the canvas or has no size", () => {
    expect(boardFit({ w: 390, h: 844 }, { x: 0, y: 844, w: 390, h: 60 })).toEqual(NO_FIT);
    expect(boardFit({ w: 390, h: 844 }, { x: 0, y: 0, w: 0, h: 0 })).toEqual(NO_FIT);
    expect(boardFit({ w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 })).toEqual(NO_FIT);
  });
});
