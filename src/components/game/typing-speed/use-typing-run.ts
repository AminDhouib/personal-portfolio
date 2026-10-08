"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { SENTINEL, REJECTED_TYPES, diffInput } from "./engine/input";
import { applyOp, createRun, tick } from "./engine/run";
import type { Op, RunConfig, TypingRun } from "./engine/types";

const CLOCK_INTERVAL_MS = 100;

interface Bookkeeping {
  /** The run onFinish has already been called for. */
  finished: TypingRun | null;
  /** The value the hidden input is known to hold. */
  lastValue: string;
  /** Log length at the last commit, to spot new keystrokes. */
  logLen: number;
}

export interface TypingRunOptions {
  inputRef: RefObject<HTMLInputElement | null>;
  /** Called once per run, when it reaches done. */
  onFinish: (run: TypingRun) => void;
  /** Called after any change that logged a keystroke. */
  onKey?: (run: TypingRun) => void;
}

export interface TypingRunApi {
  run: TypingRun;
  /** Bumps on every change; components re-render from it. */
  version: number;
  /** performance.now() at the last change or clock tick. */
  now: number;
  reset: (config: RunConfig) => void;
  /** Applies keystrokes that did not come through the input (the first key of a run). */
  press: (ops: Op[]) => void;
}

/**
 * Holds one engine run and wires the hidden input to it: each input event is
 * diffed into ops, paste/drop/yank are refused, and the input value is
 * rewritten only when it differs from SENTINEL + the current word. The run is
 * mutated in place by the engine; `version` is what re-renders the view.
 */
export function useTypingRun(
  initial: RunConfig,
  { inputRef, onFinish, onKey }: TypingRunOptions,
): TypingRunApi {
  const [run, setRun] = useState(() => createRun(initial));
  const runRef = useRef(run);
  const book = useRef<Bookkeeping>({ finished: null, lastValue: SENTINEL, logLen: 0 });
  const callbacks = useRef({ onFinish, onKey });
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    callbacks.current = { onFinish, onKey };
  }, [onFinish, onKey]);

  const commit = useCallback(() => {
    const current = runRef.current;
    const b = book.current;
    if (current.log.length > b.logLen) callbacks.current.onKey?.(current);
    b.logLen = current.log.length;
    if (current.status === "done" && b.finished !== current) {
      b.finished = current;
      callbacks.current.onFinish(current);
    }
    setNow(performance.now());
    setVersion((v) => v + 1);
  }, []);

  const syncInput = useCallback(
    (force: boolean) => {
      const el = inputRef.current;
      const current = runRef.current;
      const expected = SENTINEL + (current.typed[current.cursor] ?? "");
      if (el && (force || el.value !== expected)) {
        el.value = expected;
        el.setSelectionRange(expected.length, expected.length);
      }
      book.current.lastValue = expected;
    },
    [inputRef],
  );

  const press = useCallback(
    (ops: Op[]) => {
      for (const op of ops) applyOp(runRef.current, op, performance.now());
      syncInput(false);
      commit();
    },
    [syncInput, commit],
  );

  const reset = useCallback(
    (config: RunConfig) => {
      const fresh = createRun(config);
      runRef.current = fresh;
      book.current.finished = null;
      book.current.logLen = 0;
      setRun(fresh);
      syncInput(true);
      commit();
    },
    [syncInput, commit],
  );

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onInput = (e: Event) => {
      const current = runRef.current;
      const inputType = (e as InputEvent).inputType || "insertText";
      const diff = diffInput(book.current.lastValue, el.value, inputType);
      if (!diff.rejected && current.status !== "done") {
        for (const op of diff.ops) applyOp(current, op, performance.now());
        if (diff.bulk && diff.ops.length > 0) current.bulk++;
      }
      syncInput(false);
      commit();
    };
    const onBeforeInput = (e: Event) => {
      if (REJECTED_TYPES.includes((e as InputEvent).inputType)) e.preventDefault();
    };
    const refuse = (e: Event) => e.preventDefault();
    el.addEventListener("input", onInput);
    el.addEventListener("beforeinput", onBeforeInput);
    el.addEventListener("paste", refuse);
    el.addEventListener("drop", refuse);
    return () => {
      el.removeEventListener("input", onInput);
      el.removeEventListener("beforeinput", onBeforeInput);
      el.removeEventListener("paste", refuse);
      el.removeEventListener("drop", refuse);
    };
  }, [inputRef, syncInput, commit]);

  const running = run.status === "running";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      tick(runRef.current, performance.now());
      commit();
    }, CLOCK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [running, commit]);

  return { run, version, now, reset, press };
}
