// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MAX_STEPS_PER_FRAME, advance, createLoop, resetClock } from "../loop";

/** Feed frames at the given timestamps and count the sim steps the loop asks for. */
function stepsFor(times: readonly number[], timeScale = 1): number {
  let loop = createLoop();
  let total = 0;
  for (const t of times) {
    const out = advance(loop, t, timeScale);
    loop = out.loop;
    total += out.steps;
  }
  return total;
}

const frames = (n: number, ms: number, start = 1000) =>
  Array.from({ length: n + 1 }, (_, i) => start + i * ms);

describe("the fixed-step loop", () => {
  it.each([1, 2, 3, 59, 60, 600, 1000, 3000])(
    "%i frames of 16.7 ms produce floor(N * 16.7 / 50) ticks",
    (n) => {
      expect(stepsFor(frames(n, 16.7))).toBe(Math.floor((n * 16.7) / 50));
    },
  );

  it("takes no step on the first frame: there is no elapsed time yet", () => {
    expect(advance(createLoop(), 5000, 1).steps).toBe(0);
  });

  it("a 2 s stall produces at most 5 steps, and the backlog is dropped", () => {
    expect(MAX_STEPS_PER_FRAME).toBe(5);
    let loop = advance(createLoop(), 1000, 1).loop;
    const stall = advance(loop, 3000, 1);
    expect(stall.steps).toBe(5);
    loop = stall.loop;
    // The next ordinary frame does not try to catch up.
    expect(advance(loop, 3016.7, 1).steps).toBe(0);
  });

  it("scales game time: 2x and 3x run 2 and 3 times the steps; 0 runs none", () => {
    const sixty = frames(60, 16.7);
    expect(stepsFor(sixty, 2)).toBe(Math.floor((60 * 16.7 * 2) / 50));
    expect(stepsFor(sixty, 3)).toBe(Math.floor((60 * 16.7 * 3) / 50));
    expect(stepsFor(sixty, 0)).toBe(0);
  });

  it("after resetClock (a pause, a hidden tab) the first frame back takes no step", () => {
    let loop = advance(createLoop(), 1000, 1).loop;
    loop = advance(loop, 1040, 1).loop;
    loop = resetClock(loop);
    expect(advance(loop, 90_000, 1).steps).toBe(0);
  });

  it("ignores a clock that runs backwards", () => {
    let loop = advance(createLoop(), 1000, 1).loop;
    const back = advance(loop, 900, 1);
    expect(back.steps).toBe(0);
    loop = back.loop;
    expect(advance(loop, 950, 1).steps).toBe(1);
  });
});
