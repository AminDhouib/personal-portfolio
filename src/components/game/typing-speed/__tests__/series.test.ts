// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyOp, createRun } from "../engine/run";
import { keyStats, mergeKeyStats, wpmSeries } from "../engine/series";
import type { Op } from "../engine/types";
import { runMetrics } from "../metrics";

function play(run: ReturnType<typeof createRun>, steps: [Op, number][]) {
  for (const [op, at] of steps) applyOp(run, op, at);
}
const ch = (c: string): Op => ({ kind: "char", ch: c });

// Text "aaaa bbbb": aaaa at 0..750, a wrong extra x at 1000, Backspace, Space, then bbbb to 2250.
function example() {
  const run = createRun({ kind: "text", text: "aaaa bbbb" });
  play(run, [
    [ch("a"), 0],
    [ch("a"), 250],
    [ch("a"), 500],
    [ch("a"), 750],
    [ch("x"), 1000],
    [{ kind: "back" }, 1100],
    [{ kind: "space" }, 1250],
    [ch("b"), 1500],
    [ch("b"), 1750],
    [ch("b"), 2000],
    [ch("b"), 2250],
  ]);
  return run;
}

describe("wpmSeries", () => {
  it("has one point per started second, with errors per second", () => {
    const run = example();
    expect(run.status).toBe("done");
    const s = wpmSeries(run);
    expect(s).toHaveLength(3);
    expect(s.map((p) => p.errors)).toEqual([0, 1, 0]);
  });
  it("computes cumulative net and per-second raw WPM", () => {
    const s = wpmSeries(example());
    // second 1: 4 correct keys, 4 * 12 / 1
    expect(s[0]).toMatchObject({ wpm: 48, raw: 48 });
    // second 2 holds x, Space, b, b: 4 keystrokes
    expect(s[1]?.raw).toBe(4 * 12);
    // cumulative to 2 s: 4 a + Space + 2 b = 7 correct keys
    expect(s[1]?.wpm).toBeCloseTo((7 * 12) / 2, 5);
  });
  it("ends on the headline net WPM", () => {
    const run = example();
    const s = wpmSeries(run);
    expect(s.at(-1)?.wpm).toBe(runMetrics(run).netWpm);
  });
  it("a timed run has a point for every second of its limit", () => {
    const run = createRun({ kind: "time", seconds: 15, content: "words", seed: 3 });
    applyOp(run, ch("a"), 0);
    applyOp(run, ch("a"), 20_000);
    expect(run.status).toBe("done");
    expect(wpmSeries(run)).toHaveLength(15);
  });
  it("a finished run has at least one point", () => {
    const run = createRun({ kind: "text", text: "a" });
    applyOp(run, ch("a"), 5);
    expect(run.status).toBe("done");
    expect(wpmSeries(run).length).toBeGreaterThanOrEqual(1);
  });
});

describe("keyStats", () => {
  it("counts hits and misses by lowercased expected key and skips spaces", () => {
    const run = createRun({ kind: "text", text: "Ab cd" });
    play(run, [
      [ch("A"), 0],
      [ch("x"), 10],
      [{ kind: "back" }, 20],
      [ch("b"), 30],
      [{ kind: "space" }, 40],
      [ch("c"), 50],
      [ch("z"), 60],
    ]);
    expect(keyStats(run)).toEqual({
      a: { hits: 1, misses: 0 },
      b: { hits: 1, misses: 1 },
      c: { hits: 1, misses: 0 },
      d: { hits: 0, misses: 1 },
    });
  });
  it("never counts a space as a missed key, even one pressed too early", () => {
    const run = createRun({ kind: "text", text: "abc de" });
    play(run, [
      [ch("a"), 0],
      [{ kind: "space" }, 10],
    ]);
    expect(keyStats(run)).toEqual({ a: { hits: 1, misses: 0 } });
  });
  it("ignores extra letters and back ops", () => {
    const run = createRun({ kind: "text", text: "a b" });
    play(run, [
      [ch("a"), 0],
      [ch("q"), 10],
      [{ kind: "backWord" }, 20],
    ]);
    expect(keyStats(run)).toEqual({ a: { hits: 1, misses: 0 } });
  });
  it("merges by adding", () => {
    expect(
      mergeKeyStats(
        { e: { hits: 1, misses: 1 } },
        { e: { hits: 2, misses: 0 }, t: { hits: 1, misses: 0 } },
      ),
    ).toEqual({ e: { hits: 3, misses: 1 }, t: { hits: 1, misses: 0 } });
  });
});
