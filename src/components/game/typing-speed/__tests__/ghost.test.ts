// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  SAMPLE_MS,
  ghostCharsAt,
  ghostPosition,
  ghostSeries,
  netCharsAt,
  paceDelta,
  sampleRun,
} from "../engine/ghost";
import { applyOp, createRun } from "../engine/run";
import type { Op, TypingRun } from "../engine/types";
import { runMetrics } from "../metrics";

const ch = (c: string): Op => ({ kind: "char", ch: c });

function play(run: TypingRun, steps: [Op, number][]) {
  for (const [op, at] of steps) applyOp(run, op, at);
}

// Text "aaaa bbbb": aaaa at 0..750, a wrong x at 1000, Backspace, Space, then bbbb to 2250.
function example(): TypingRun {
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

describe("netCharsAt", () => {
  it("replays the log up to t and ends on the run's net characters", () => {
    const run = example();
    expect(run.status).toBe("done");
    expect(netCharsAt(run, 0)).toBe(1);
    expect(netCharsAt(run, 750)).toBe(4);
    expect(netCharsAt(run, 1000)).toBe(0); // a wrong letter breaks the prefix
    expect(netCharsAt(run, 1100)).toBe(4);
    expect(netCharsAt(run, 1250)).toBe(5);
    expect(netCharsAt(run, 1500)).toBe(6);
    expect(netCharsAt(run, 2250)).toBe(runMetrics(run).netChars);
    expect(netCharsAt(run, 99_999)).toBe(9);
  });

  it("is zero before any keystroke", () => {
    expect(netCharsAt(createRun({ kind: "text", text: "ab" }), 500)).toBe(0);
    expect(netCharsAt(example(), -5)).toBe(0);
  });

  it("follows Backspace into a wrong earlier word", () => {
    const run = createRun({ kind: "text", text: "ab cd" });
    play(run, [
      [ch("a"), 0],
      [ch("x"), 100],
      [{ kind: "space" }, 200], // word 0 is wrong, the cursor moves on
      [{ kind: "back" }, 300], // back into the wrong word
      [{ kind: "back" }, 400], // drops the x
      [ch("b"), 500],
      [{ kind: "space" }, 600],
      [ch("c"), 700],
    ]);
    expect(netCharsAt(run, 250)).toBe(0);
    expect(netCharsAt(run, 350)).toBe(0);
    expect(netCharsAt(run, 450)).toBe(1);
    expect(netCharsAt(run, 600)).toBe(3);
    expect(netCharsAt(run, 700)).toBe(4);
    expect(netCharsAt(run, 700)).toBe(runMetrics(run, 700).netChars);
  });
});

describe("netCharsAt on the last word of a text run", () => {
  it("counts the partial prefix when Space ends the run, as the engine does", () => {
    const run = createRun({ kind: "text", text: "ab" });
    play(run, [
      [ch("a"), 0],
      [{ kind: "space" }, 100], // finishes the run without advancing the cursor
    ]);
    expect(run.status).toBe("done");
    expect(runMetrics(run).netChars).toBe(1);
    expect(netCharsAt(run, 100)).toBe(runMetrics(run).netChars);
    expect(sampleRun(run).at(-1)).toBe(1);
  });
});

describe("sampleRun", () => {
  it("has ceil(elapsed / 250) + 1 integers and starts at 0", () => {
    const samples = sampleRun(example());
    expect(SAMPLE_MS).toBe(250);
    expect(samples).toEqual([0, 2, 3, 4, 0, 5, 6, 7, 8, 9]);
    expect(samples.every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
  });

  it("gives 481 samples for a full 120 s timed run", () => {
    const run = createRun({ kind: "time", seconds: 120, content: "words", seed: 5 });
    applyOp(run, ch(run.words[0]?.[0] ?? "a"), 0);
    applyOp(run, ch("z"), 120_000); // ends the run at its limit
    expect(run.status).toBe("done");
    expect(sampleRun(run)).toHaveLength(481);
  });

  it("is a single zero for a run that never started", () => {
    expect(sampleRun(createRun({ kind: "text", text: "ab" }))).toEqual([0]);
  });
});

describe("ghostCharsAt", () => {
  const samples = [0, 10, 20];
  it("interpolates linearly between samples", () => {
    expect(ghostCharsAt(samples, 125)).toBe(5);
    expect(ghostCharsAt(samples, 250)).toBe(10);
    expect(ghostCharsAt(samples, 375)).toBe(15);
  });
  it("holds the last value after the end and the first before the start", () => {
    expect(ghostCharsAt(samples, 500)).toBe(20);
    expect(ghostCharsAt(samples, 9_999)).toBe(20);
    expect(ghostCharsAt(samples, -50)).toBe(0);
  });
  it("is zero without samples", () => {
    expect(ghostCharsAt([], 100)).toBe(0);
  });
});

describe("ghostPosition", () => {
  const words = ["ab", "cd", "e"];
  it("maps a character count onto a word and letter, a space being one character", () => {
    expect(ghostPosition(words, 0)).toEqual({ word: 0, letter: 0 });
    expect(ghostPosition(words, 1)).toEqual({ word: 0, letter: 1 });
    expect(ghostPosition(words, 2)).toEqual({ word: 0, letter: 2 }); // on the space
    expect(ghostPosition(words, 3)).toEqual({ word: 1, letter: 0 });
    expect(ghostPosition(words, 4)).toEqual({ word: 1, letter: 1 });
    expect(ghostPosition(words, 6)).toEqual({ word: 2, letter: 0 });
  });
  it("floors a fraction and clamps past the end", () => {
    expect(ghostPosition(words, 1.9)).toEqual({ word: 0, letter: 1 });
    expect(ghostPosition(words, 7)).toEqual({ word: 2, letter: 1 });
    expect(ghostPosition(words, 999)).toEqual({ word: 2, letter: 1 });
    expect(ghostPosition(words, -3)).toEqual({ word: 0, letter: 0 });
  });
  it("copes with no words", () => {
    expect(ghostPosition([], 5)).toEqual({ word: 0, letter: 0 });
  });
});

describe("paceDelta", () => {
  it("is the live net characters minus the ghost's at the same elapsed time", () => {
    const run = createRun({ kind: "text", text: "aaaa bbbb" });
    play(run, [
      [ch("a"), 1000],
      [ch("a"), 1250],
      [ch("a"), 1500],
      [ch("a"), 1750],
    ]);
    const samples = [0, 2, 4, 6, 8];
    expect(paceDelta(run, samples, 1750)).toBe(4 - 6); // 750 ms in: ghost at 6
    expect(paceDelta(run, samples, 1250)).toBe(4 - 2); // 250 ms in: ghost at 2
    expect(paceDelta(run, samples, 1000)).toBe(4 - 0);
  });
  it("is the live characters when the run has not started", () => {
    expect(paceDelta(createRun({ kind: "text", text: "ab" }), [0, 5], 400)).toBe(0);
  });
});

describe("ghostSeries", () => {
  it("is the ghost's cumulative WPM at the end of each second", () => {
    const samples = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // 4 characters a second
    expect(ghostSeries(samples, 2)).toEqual([48, 48]);
  });
  it("stops where the ghost run ended instead of decaying", () => {
    const samples = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // a 2 s run
    expect(ghostSeries(samples, 5)).toEqual([48, 48]);
  });
  it("is empty for no samples", () => {
    expect(ghostSeries([], 3)).toEqual([]);
  });
});
