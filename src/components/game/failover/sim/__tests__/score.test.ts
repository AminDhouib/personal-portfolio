// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scoreOf } from "../score";
import { resetSim, S } from "../state";
import { resetWorld } from "./helpers";

beforeEach(() => resetWorld({ mode: "survival" }));
afterEach(() => resetSim({ seed: "after-score" }));

describe("scoreOf", () => {
  it("is ten points a whole second plus the points banked", () => {
    // 61.7 s survived with 345.9 points banked: 61 * 10 + 345.
    S.tick = 1234;
    S.score.total = 345.9;
    expect(scoreOf()).toBe(955);
  });

  it("counts a second only once it is whole", () => {
    S.score.total = 0;
    S.tick = 19;
    expect(scoreOf()).toBe(0);
    S.tick = 20;
    expect(scoreOf()).toBe(10);
    S.tick = 18000;
    expect(scoreOf()).toBe(9000);
  });

  it("never lets penalties push the points below zero", () => {
    S.tick = 200;
    S.score.total = -50;
    expect(scoreOf()).toBe(100);
  });

  it("is zero for a run that has not started", () => {
    expect(scoreOf()).toBe(0);
  });

  it("is an integer however the points fall", () => {
    S.tick = 777;
    S.score.total = 12.999999;
    expect(Number.isInteger(scoreOf())).toBe(true);
    expect(scoreOf()).toBe(38 * 10 + 12);
  });
});
