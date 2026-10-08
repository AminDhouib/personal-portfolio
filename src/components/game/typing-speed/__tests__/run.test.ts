// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LOOKAHEAD_WORDS, MAX_EXTRA, applyOp, createRun, tick } from "../engine/run";
import type { TypingRun } from "../engine/types";

const text = (t: string) => createRun({ kind: "text", text: t });
function typeAll(run: TypingRun, s: string, t0 = 0, step = 100): number {
  let t = t0;
  for (const ch of s) {
    applyOp(run, ch === " " ? { kind: "space" } : { kind: "char", ch }, t);
    t += step;
  }
  return t - step;
}

describe("clock", () => {
  it("starts on the first keystroke, not when the run is created or ticked", () => {
    const run = text("ab cd");
    tick(run, 5000);
    expect(run.status).toBe("ready");
    applyOp(run, { kind: "char", ch: "a" }, 7000);
    expect(run).toMatchObject({ status: "running", startedAt: 7000 });
    expect(run.log[0]).toMatchObject({ t: 0, ch: "a", expected: "a", correct: true });
  });
  it("a space or a backspace on a fresh run does not start it", () => {
    const run = text("ab");
    applyOp(run, { kind: "space" }, 10);
    applyOp(run, { kind: "back" }, 20);
    expect(run.status).toBe("ready");
    expect(run.log).toEqual([]);
  });
});

describe("text runs", () => {
  it("finish on the last correct letter, without a trailing space", () => {
    const run = text("ab cd");
    const last = typeAll(run, "ab cd", 1000);
    expect(run).toMatchObject({ status: "done", endedAt: last });
  });
  it("a wrong last word does not finish until it is fixed", () => {
    const run = text("ab cd");
    typeAll(run, "ab cx");
    expect(run.status).toBe("running");
    applyOp(run, { kind: "back" }, 900);
    applyOp(run, { kind: "char", ch: "d" }, 1000);
    expect(run.status).toBe("done");
  });
  it("a space on the last word ends the run even when that word is wrong", () => {
    const run = text("ab cd");
    typeAll(run, "ab cx ");
    expect(run.status).toBe("done");
  });
  it("ignores keystrokes after the run is done", () => {
    const run = text("ab");
    typeAll(run, "ab");
    const n = run.log.length;
    applyOp(run, { kind: "char", ch: "z" }, 9999);
    expect(run.log).toHaveLength(n);
  });
});

describe("word-based input (audit bug 3)", () => {
  it("a dropped letter stays inside its word; the next word starts aligned", () => {
    const run = text("hello world again");
    typeAll(run, "helo world again");
    expect(run.typed).toEqual(["helo", "world", "again"]);
    // the "o" typed where "l" was expected, and the space committing "helo"
    expect(run.log.filter((k) => k.correct === false)).toHaveLength(2);
    expect(run.status).toBe("done");
  });
  it("accepts at most MAX_EXTRA letters past a word's end, all marked extra and wrong", () => {
    const run = text("ab cd");
    typeAll(run, "ab" + "z".repeat(MAX_EXTRA + 5));
    expect(run.typed[0]).toBe("ab" + "z".repeat(MAX_EXTRA));
    const extras = run.log.filter((k) => k.expected === "");
    expect(extras).toHaveLength(MAX_EXTRA);
    expect(extras.every((k) => k.correct === false)).toBe(true);
  });
  it("a space on an empty word is ignored (no skipping with double spaces)", () => {
    const run = text("ab cd");
    typeAll(run, "ab  ");
    expect(run.cursor).toBe(1);
    expect(run.log.filter((k) => k.kind === "space")).toHaveLength(1);
  });
  it("Backspace edits the current word and is logged without a verdict", () => {
    const run = text("ab cd");
    typeAll(run, "ax");
    applyOp(run, { kind: "back" }, 500);
    expect(run.typed[0]).toBe("a");
    expect(run.log.at(-1)).toMatchObject({ kind: "back" });
    expect(run.log.at(-1)?.correct).toBeUndefined();
  });
  it("Backspace at a word start returns into the previous word only if it was wrong", () => {
    const right = text("ab cd");
    typeAll(right, "ab ");
    applyOp(right, { kind: "back" }, 900);
    expect(right.cursor).toBe(1);
    const wrong = text("ab cd");
    typeAll(wrong, "ax ");
    applyOp(wrong, { kind: "back" }, 900);
    expect(wrong).toMatchObject({ cursor: 0 });
    expect(wrong.typed[0]).toBe("ax");
  });
  it("backWord clears the current word", () => {
    const run = text("abc de");
    typeAll(run, "abx");
    applyOp(run, { kind: "backWord" }, 900);
    expect(run.typed[0]).toBe("");
  });
});

describe("timed runs", () => {
  const timed = (seconds: 15 | 30 | 60 | 120 = 15, seed = 1) =>
    createRun({ kind: "time", seconds, content: "words", seed });
  it("end exactly at the limit, measured from the first keystroke", () => {
    const run = timed(15);
    applyOp(run, { kind: "char", ch: run.words[0]![0]! }, 2000);
    tick(run, 16_999);
    expect(run.status).toBe("running");
    tick(run, 17_000);
    expect(run).toMatchObject({ status: "done", endedAt: 17_000 });
  });
  it("a keystroke that arrives after the limit ends the run and is not logged", () => {
    const run = timed(15);
    applyOp(run, { kind: "char", ch: run.words[0]![0]! }, 0);
    applyOp(run, { kind: "char", ch: "q" }, 15_001);
    expect(run).toMatchObject({ status: "done", endedAt: 15_000 });
    expect(run.log).toHaveLength(1);
  });
  it("keeps at least LOOKAHEAD_WORDS words ahead of the cursor", () => {
    const run = timed(60);
    for (let i = 0; i < 80; i++) {
      const w = run.words[run.cursor]!;
      typeAll(run, w + " ", i * 1000, 10);
    }
    expect(run.words.length - run.cursor).toBeGreaterThanOrEqual(LOOKAHEAD_WORDS);
  });
  it("is deterministic for a seed; quotes content streams whole passages", () => {
    expect(timed(30, 7).words).toEqual(timed(30, 7).words);
    expect(timed(30, 7).words).not.toEqual(timed(30, 8).words);
    const q = createRun({ kind: "time", seconds: 30, content: "quotes", seed: 3 });
    expect(q.words.join(" ").length).toBeGreaterThan(0);
  });
});
