"use client";

import { gameCrashToReport } from "@/lib/report-game-error";
import { parseFromWorker, type CompileErrorKind, type ToWorker } from "./protocol";

/** From the start to `ready`: the player's top-level code and constructor. */
export const LOAD_MS = 1_000;
/** Between two consecutive messages: one turn of `playTurn`. */
export const TURN_MS = 250;
/** The whole run, start to `done`. */
export const RUN_MS = 5_000;

export type CompileErrorInfo = {
  kind: CompileErrorKind;
  message: string;
  line: number | null;
};

export type RunOutcome =
  | { kind: "finished"; log: string; thoughts: string[][] }
  | { kind: "compile-error"; error: CompileErrorInfo }
  | { kind: "player-error"; log: string; t: number; message: string; line: number | null }
  | { kind: "timeout"; log: string; phase: "load" | "turn" | "run"; t: number }
  | { kind: "crash"; log: string }
  | { kind: "cancelled"; log: string }
  | { kind: "no-worker" };

// The `new URL(...)` has to sit inside the `new Worker(...)` call as a literal: that is the
// form Turbopack and webpack bundle as a worker chunk (solve-client.ts has the same shape).
function defaultMakeWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  return new Worker(new URL("./worker.ts", import.meta.url));
}

/**
 * Runs the player's code in a fresh Web Worker and watches it from here. Synchronous player code
 * cannot be interrupted from inside the worker, so three deadlines are enforced from outside and
 * a breach terminates the worker: LOAD_MS to `ready`, TURN_MS between messages, RUN_MS overall.
 * Everything the worker posts is checked by `parseFromWorker` and by turn order; anything else
 * ends the run as a crash. One worker per call, terminated on every exit path, and there is no
 * main-thread fallback: without Workers the outcome is `no-worker`.
 */
export function runInSandbox(
  req: Omit<ToWorker, "type">,
  onTurn: (t: number, token: string, thoughts: string[]) => void,
  makeWorker: () => Worker | null = defaultMakeWorker,
): { done: Promise<RunOutcome>; cancel: () => void } {
  let resolve: (outcome: RunOutcome) => void = () => {};
  const done = new Promise<RunOutcome>((r) => {
    resolve = r;
  });

  let worker: Worker | null = null;
  try {
    worker = makeWorker();
  } catch {
    // silent-ok: a browser that blocks Workers is reported to the player as the no-worker outcome
    worker = null;
  }
  if (!worker) {
    resolve({ kind: "no-worker" });
    return { done, cancel: () => {} };
  }

  const tokens: string[] = [];
  const thoughts: string[][] = [];
  let ready = false;
  let settled = false;
  let turnTimer: ReturnType<typeof setTimeout> | undefined;
  const loadTimer = setTimeout(() => timeout("load"), LOAD_MS);
  const runTimer = setTimeout(() => timeout("run"), RUN_MS);
  const log = (): string => `1:${tokens.join("")}`;

  function finish(outcome: RunOutcome): void {
    if (settled) return;
    settled = true;
    clearTimeout(loadTimer);
    clearTimeout(turnTimer);
    clearTimeout(runTimer);
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
    resolve(outcome);
  }

  function crash(cause: unknown): void {
    if (settled) return;
    const report = gameCrashToReport("script-knight-sandbox", cause);
    if (report) reportError(report);
    finish({ kind: "crash", log: log() });
  }

  function timeout(phase: "load" | "turn" | "run"): void {
    finish({ kind: "timeout", log: log(), phase, t: tokens.length + 1 });
  }

  function armTurnTimer(): void {
    clearTimeout(turnTimer);
    turnTimer = setTimeout(() => timeout("turn"), TURN_MS);
  }

  worker.onmessage = (event: MessageEvent<unknown>) => {
    if (settled) return;
    const message = parseFromWorker(event.data);
    if (!message) {
      crash(new Error("The sandbox posted a message that does not fit the protocol."));
      return;
    }
    if (!ready) {
      if (message.type === "ready") {
        ready = true;
        clearTimeout(loadTimer);
        armTurnTimer();
      } else if (message.type === "compile-error") {
        const { kind, message: text, line } = message;
        finish({ kind: "compile-error", error: { kind, message: text, line } });
      } else {
        crash(new Error(`The sandbox sent ${message.type} before it was ready.`));
      }
      return;
    }
    switch (message.type) {
      case "turn":
        if (message.t !== tokens.length + 1) {
          crash(new Error(`The sandbox sent turn ${message.t} out of order.`));
          return;
        }
        tokens.push(message.a);
        thoughts.push(message.thoughts);
        try {
          onTurn(message.t, message.a, message.thoughts);
        } catch (err) {
          // silent-ok: crash() reports it, once per page, and ends the run
          crash(err);
          return;
        }
        armTurnTimer();
        return;
      case "done":
        finish({ kind: "finished", log: log(), thoughts });
        return;
      case "player-error":
        if (message.t !== tokens.length + 1) {
          crash(new Error(`The sandbox reported an error on turn ${message.t} out of order.`));
          return;
        }
        finish({
          kind: "player-error",
          log: log(),
          t: message.t,
          message: message.message,
          line: message.line,
        });
        return;
      case "ready":
      case "compile-error":
        crash(new Error(`The sandbox sent ${message.type} after it was ready.`));
    }
  };
  worker.onerror = (event: ErrorEvent) => {
    event.preventDefault();
    crash(event.error ?? new Error(event.message));
  };
  worker.onmessageerror = () => {
    crash(new Error("The sandbox posted a message that could not be read."));
  };

  try {
    worker.postMessage({ type: "run", ...req } satisfies ToWorker);
  } catch (err) {
    // silent-ok: crash() reports it, once per page, and ends the run
    crash(err);
  }

  return { done, cancel: () => finish({ kind: "cancelled", log: log() }) };
}
