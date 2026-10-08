// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyOp, createRun } from "../engine/run";
import {
  accuracyPercent,
  charCounts,
  isNewBest,
  liveWpm,
  runMetrics,
  streaks,
  wpm,
} from "../metrics";

describe("typing-speed metrics", () => {
  it("liveWpm stays 0 for the first second, then matches wpm", () => {
    expect(liveWpm(2, 80)).toBe(0);
    expect(liveWpm(10, 999)).toBe(0);
    expect(liveWpm(250, 60000)).toBe(wpm(250, 60000));
  });

  it("wpm is (chars / 5) per minute", () => {
    expect(wpm(250, 60000)).toBe(50);
  });

  it("wpm is 0 when no characters were typed", () => {
    expect(wpm(0, 1000)).toBe(0);
  });

  it("wpm is 0 when no time has elapsed", () => {
    expect(wpm(100, 0)).toBe(0);
  });

  it("accuracyPercent is correct over total keystrokes", () => {
    expect(accuracyPercent(47, 100)).toBe(47);
  });

  it("accuracyPercent is 100 when nothing was typed", () => {
    expect(accuracyPercent(0, 0)).toBe(100);
  });

  it("the first ever run is not a new best", () => {
    expect(isNewBest(60, null)).toBe(false);
  });

  it("a tie is not a new best", () => {
    expect(isNewBest(60, 60)).toBe(false);
  });

  it("beating the previous best is a new best", () => {
    expect(isNewBest(61, 60)).toBe(true);
  });
});

function typeAt(run: ReturnType<typeof createRun>, s: string, step: number, t0 = 0) {
  [...s].forEach((ch, i) =>
    applyOp(run, ch === " " ? { kind: "space" } : { kind: "char", ch }, t0 + i * step),
  );
}

describe("runMetrics", () => {
  it("audit bug 2: typing at 100 WPM shows 100 WPM", () => {
    const text = Array.from({ length: 100 }, () => "abcd").join(" "); // 499 characters
    const run = createRun({ kind: "text", text });
    typeAt(run, text, 120); // 498 gaps of 120 ms = 59.76 s
    expect(runMetrics(run).netWpm).toBe(100);
    expect(runMetrics(run).accuracy).toBe(100);
  });
  it("audit bug 1: a fixed mistake still costs accuracy and is reported", () => {
    const run = createRun({ kind: "text", text: "ab" });
    applyOp(run, { kind: "char", ch: "a" }, 0);
    applyOp(run, { kind: "char", ch: "x" }, 100);
    applyOp(run, { kind: "back" }, 200);
    applyOp(run, { kind: "char", ch: "b" }, 300);
    const m = runMetrics(run);
    expect(m).toMatchObject({ accuracy: 67, mistakesTyped: 1, mistakesLeft: 0 });
  });
  it("net counts correct words with their spaces; raw counts everything typed", () => {
    const run = createRun({ kind: "text", text: "aaaa bbbb cccc" });
    typeAt(run, "aaaa bxbb cccc", 100); // 14 keys over 1.3 s
    const m = runMetrics(run);
    expect(m.netChars).toBe(5 + 4); // "aaaa " and the final "cccc"
    expect(m.rawWpm).toBe(Math.round((14 * 12000) / 1300));
    expect(m.netWpm).toBe(Math.round((9 * 12000) / 1300));
  });
  it("a timed run counts the correct prefix of its unfinished last word", () => {
    const run = createRun({ kind: "time", seconds: 15, content: "words", seed: 5 });
    const w0 = run.words[0]!;
    const w1 = run.words[1]!;
    typeAt(run, `${w0} ${w1.slice(0, 2)}`, 100);
    expect(runMetrics(run, 5_000).netChars).toBe(w0.length + 1 + 2); // the correct prefix counts
    applyOp(run, { kind: "char", ch: "~" }, 14_000); // wrong, then the clock runs out
    const m = runMetrics(run, 20_000);
    expect(m.elapsedMs).toBe(15_000);
    expect(m.netChars).toBe(w0.length + 1); // the prefix now holds a mistake, so it counts 0
  });
  it("is all zero before the first keystroke", () => {
    expect(runMetrics(createRun({ kind: "text", text: "ab" }))).toMatchObject({
      netWpm: 0,
      rawWpm: 0,
      accuracy: 100,
      elapsedMs: 0,
    });
  });
});

describe("streaks", () => {
  it("counts consecutive correct keystrokes; a slip resets, Backspace is neutral", () => {
    const run = createRun({ kind: "text", text: "abcd efgh" });
    typeAt(run, "abx", 10); // 2 right, then a slip
    expect(streaks(run)).toEqual({ current: 0, best: 2 });
    applyOp(run, { kind: "back" }, 100);
    applyOp(run, { kind: "char", ch: "c" }, 110);
    applyOp(run, { kind: "char", ch: "d" }, 120);
    expect(streaks(run)).toEqual({ current: 2, best: 2 });
  });
});

describe("charCounts", () => {
  it("splits the final text into correct, incorrect, extra and missed letters", () => {
    const run = createRun({ kind: "text", text: "abc def ghi jk" });
    // abx: 2 correct + 1 wrong; de: 2 correct + f missed; ghiz: 3 correct + 1 extra; jk: 2 correct
    typeAt(run, "abx de ghiz jk", 50);
    expect(run.status).toBe("done");
    expect(charCounts(run)).toEqual({ correct: 9, incorrect: 1, extra: 1, missed: 1 });
  });
});
