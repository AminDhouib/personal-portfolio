import { passageAt, splitWords, wordAt } from "./text";
import type { Op, RunConfig, TypingRun } from "./types";

/** Letters accepted past a word's end; they are marked wrong. */
export const MAX_EXTRA = 10;
/** A timed run always has at least this many words ahead of the cursor. */
export const LOOKAHEAD_WORDS = 50;

function ensureWords(run: TypingRun): void {
  const c = run.config;
  if (c.kind !== "time") return;
  while (run.words.length - run.cursor < LOOKAHEAD_WORDS) {
    if (c.content === "words") {
      run.words.push(wordAt(c.seed, run.supply++));
    } else {
      run.words.push(...splitWords(passageAt(c.seed, run.supply++).text));
    }
  }
}

export function createRun(config: RunConfig): TypingRun {
  const run: TypingRun = {
    config,
    words: config.kind === "text" ? splitWords(config.text) : [],
    typed: [""],
    cursor: 0,
    startedAt: null,
    endedAt: null,
    status: "ready",
    log: [],
    bulk: 0,
    supply: 0,
  };
  ensureWords(run);
  return run;
}

export function currentWord(run: TypingRun): string {
  return run.words[run.cursor] ?? "";
}

/** Ends a timed run whose clock has reached its limit. */
export function tick(run: TypingRun, now: number): void {
  if (run.status !== "running" || run.config.kind !== "time" || run.startedAt === null) return;
  const limit = run.config.seconds * 1000;
  if (now - run.startedAt >= limit) {
    run.status = "done";
    run.endedAt = run.startedAt + limit;
  }
}

function finish(run: TypingRun, now: number): void {
  run.status = "done";
  run.endedAt = now;
}

function isLastWord(run: TypingRun): boolean {
  return run.config.kind === "text" && run.cursor === run.words.length - 1;
}

export function applyOp(run: TypingRun, op: Op, now: number): void {
  tick(run, now);
  if (run.status === "done") return;
  const word = currentWord(run);
  const cur = run.typed[run.cursor] ?? "";

  if (op.kind === "char") {
    if (cur.length >= word.length + MAX_EXTRA) return;
    start(run, now);
    const expected = cur.length < word.length ? (word[cur.length] ?? "") : "";
    run.typed[run.cursor] = cur + op.ch;
    run.log.push({
      t: now - (run.startedAt ?? now),
      kind: "char",
      ch: op.ch,
      expected,
      correct: op.ch === expected,
      word: run.cursor,
    });
    if (isLastWord(run) && run.typed[run.cursor] === word) finish(run, now);
    return;
  }

  if (op.kind === "space") {
    if (run.status === "ready" || cur === "") return;
    run.log.push({
      t: now - (run.startedAt ?? now),
      kind: "space",
      expected: " ",
      correct: cur === word,
      word: run.cursor,
    });
    if (isLastWord(run)) {
      finish(run, now);
      return;
    }
    run.cursor++;
    if (run.typed.length <= run.cursor) run.typed.push("");
    ensureWords(run);
    return;
  }

  if (run.status === "ready") return;
  const t = now - (run.startedAt ?? now);
  if (cur !== "") {
    run.typed[run.cursor] = op.kind === "backWord" ? "" : cur.slice(0, -1);
    run.log.push({ t, kind: op.kind, word: run.cursor });
    return;
  }
  // At a word start: step back into the previous word only if it was wrong.
  const prev = run.cursor - 1;
  if (prev >= 0 && run.typed[prev] !== run.words[prev]) {
    run.typed.length = run.cursor;
    run.cursor = prev;
    run.log.push({ t, kind: op.kind, word: run.cursor });
  }
}

function start(run: TypingRun, now: number): void {
  if (run.status !== "ready") return;
  run.status = "running";
  run.startedAt = now;
}
