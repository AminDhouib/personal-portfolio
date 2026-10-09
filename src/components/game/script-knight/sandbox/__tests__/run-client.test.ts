import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FromWorker } from "../protocol";
import { BOOT_MS, LOAD_MS, RUN_MS, runInSandbox, TURN_MS } from "../run-client";

const REQ = {
  code: "class Player { playTurn() {} }",
  language: "javascript" as const,
  level: { kind: "tower" as const, tower: "narrow-path" as const, level: 1, epic: false },
};

/** A stand-in for the real Worker: the page's handlers are called by `emit`, never by a thread. */
class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn((_message: unknown) => {
    this.onPost?.(this);
  });
  terminate = vi.fn();
  constructor(readonly onPost?: (worker: FakeWorker) => void) {}

  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }
  fail(message: string): void {
    this.onerror?.({ message, error: new Error(message), preventDefault: vi.fn() } as never);
  }
}

function start(onPost?: (worker: FakeWorker) => void) {
  const worker = new FakeWorker(onPost);
  const turns: Array<[number, string, string[]]> = [];
  const run = runInSandbox(
    REQ,
    (t, token, thoughts) => void turns.push([t, token, thoughts]),
    () => worker as unknown as Worker,
  );
  return { worker, turns, ...run };
}

const booted = (w: FakeWorker): void => w.emit({ type: "booted" });

const turnMsg = (t: number, a = "w-", thoughts: string[] = []): FromWorker => ({
  type: "turn",
  t,
  a,
  thoughts,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("reportError", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("runInSandbox", () => {
  it("posts the run request and finishes with the log and the thoughts", async () => {
    const { worker, turns, done } = start();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "run", ...REQ });
    booted(worker);
    worker.emit({ type: "ready" });
    worker.emit(turnMsg(1, "w-", ["a"]));
    worker.emit(turnMsg(2, "a0"));
    worker.emit({ type: "done" });
    expect(await done).toEqual({ kind: "finished", log: "1:w-a0", thoughts: [["a"], []] });
    expect(turns).toEqual([
      [1, "w-", ["a"]],
      [2, "a0", []],
    ]);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out at load when there is no ready within 1,000 ms of booting", async () => {
    const { worker, done } = start();
    booted(worker);
    await vi.advanceTimersByTimeAsync(LOAD_MS);
    expect(await done).toEqual({ kind: "timeout", log: "1:", phase: "load", t: 1 });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not time out at load just before the deadline", async () => {
    const { worker } = start();
    booted(worker);
    await vi.advanceTimersByTimeAsync(LOAD_MS - 1);
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.emit({ type: "ready" });
    await vi.advanceTimersByTimeAsync(TURN_MS - 1);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("does not count the worker's boot time against the player's load deadline", async () => {
    const { worker, done } = start();
    await vi.advanceTimersByTimeAsync(BOOT_MS - 1);
    expect(worker.terminate).not.toHaveBeenCalled();
    booted(worker);
    await vi.advanceTimersByTimeAsync(LOAD_MS - 1);
    expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await done).toEqual({ kind: "timeout", log: "1:", phase: "load", t: 1 });
  });

  it("times out at boot when the worker never says it booted", async () => {
    const { worker, done } = start();
    await vi.advanceTimersByTimeAsync(BOOT_MS);
    expect(await done).toEqual({ kind: "timeout", log: "1:", phase: "boot", t: 1 });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ends as a crash on a ready before booted, or a second booted", async () => {
    const early = start();
    early.worker.emit({ type: "ready" });
    expect(await early.done).toEqual({ kind: "crash", log: "1:" });

    const twice = start();
    booted(twice.worker);
    booted(twice.worker);
    expect(await twice.done).toEqual({ kind: "crash", log: "1:" });
  });

  it("times out on a turn that takes over 250 ms, with the turns so far", async () => {
    const { worker, done } = start();
    booted(worker);
    worker.emit({ type: "ready" });
    for (let t = 1; t <= 4; t += 1) worker.emit(turnMsg(t));
    await vi.advanceTimersByTimeAsync(TURN_MS);
    expect(await done).toEqual({
      kind: "timeout",
      log: "1:w-w-w-w-",
      phase: "turn",
      t: 5,
    });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("times out when the whole run passes 5,000 ms, even with quick turns", async () => {
    const { worker, done } = start((w) => {
      setTimeout(() => {
        booted(w);
        w.emit({ type: "ready" });
        let t = 0;
        setInterval(() => w.emit(turnMsg((t += 1))), 200);
      }, 8_000);
    });
    // The run deadline starts at boot, not at the start of the call.
    await vi.advanceTimersByTimeAsync(8_000 + RUN_MS);
    const outcome = await done;
    expect(outcome).toMatchObject({ kind: "timeout", phase: "run" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    // Only the fake worker's own interval is left; the client cleared all of its timers.
    expect(vi.getTimerCount()).toBe(1);
  });

  it("ends as a crash on a worker error", async () => {
    const { worker, done } = start();
    booted(worker);
    worker.emit({ type: "ready" });
    worker.emit(turnMsg(1));
    worker.fail("out of memory");
    expect(await done).toEqual({ kind: "crash", log: "1:w-" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("reports a crash once per page", async () => {
    vi.resetModules();
    const fresh = await import("../run-client");
    for (let i = 0; i < 2; i += 1) {
      const worker = new FakeWorker();
      const run = fresh.runInSandbox(REQ, vi.fn(), () => worker as unknown as Worker);
      worker.fail("again");
      expect(await run.done).toEqual({ kind: "crash", log: "1:" });
    }
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it("ends as a crash when a message cannot be read", async () => {
    const { worker, done } = start();
    worker.onmessageerror?.();
    expect(await done).toEqual({ kind: "crash", log: "1:" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("ends as a crash on a message that does not fit the protocol", async () => {
    for (const bad of [
      { type: "turn", t: 1, a: "w-w-", thoughts: [] },
      { type: "ready", extra: true },
      "ready",
      null,
      { type: "done", forged: true },
    ]) {
      const { worker, done } = start();
      booted(worker);
      worker.emit({ type: "ready" });
      worker.emit(bad);
      expect(await done).toEqual({ kind: "crash", log: "1:" });
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    }
  });

  it("ends as a crash on messages in the wrong order", async () => {
    const early = start();
    early.worker.emit(turnMsg(1));
    expect(await early.done).toEqual({ kind: "crash", log: "1:" });

    const skipped = start();
    booted(skipped.worker);
    skipped.worker.emit({ type: "ready" });
    skipped.worker.emit(turnMsg(2));
    expect(await skipped.done).toEqual({ kind: "crash", log: "1:" });

    const twice = start();
    booted(twice.worker);
    twice.worker.emit({ type: "ready" });
    twice.worker.emit({ type: "ready" });
    expect(await twice.done).toEqual({ kind: "crash", log: "1:" });

    const errorAhead = start();
    booted(errorAhead.worker);
    errorAhead.worker.emit({ type: "ready" });
    errorAhead.worker.emit({ type: "player-error", t: 3, message: "m", line: null });
    expect(await errorAhead.done).toEqual({ kind: "crash", log: "1:" });
  });

  it("ends as a crash when the turn callback throws", async () => {
    const worker = new FakeWorker();
    const run = runInSandbox(
      REQ,
      () => {
        throw new Error("renderer broke");
      },
      () => worker as unknown as Worker,
    );
    booted(worker);
    worker.emit({ type: "ready" });
    worker.emit(turnMsg(1));
    expect(await run.done).toEqual({ kind: "crash", log: "1:w-" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("reports a compile error and terminates", async () => {
    const { worker, done } = start();
    booted(worker);
    worker.emit({ type: "compile-error", kind: "no-player", message: "m", line: null });
    expect(await done).toEqual({
      kind: "compile-error",
      error: { kind: "no-player", message: "m", line: null },
    });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("reports a player error with the turns before it", async () => {
    const { worker, done } = start();
    booted(worker);
    worker.emit({ type: "ready" });
    worker.emit(turnMsg(1));
    worker.emit({ type: "player-error", t: 2, message: "TypeError: x", line: 7 });
    expect(await done).toEqual({
      kind: "player-error",
      log: "1:w-",
      t: 2,
      message: "TypeError: x",
      line: 7,
    });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("cancel terminates and resolves, and later messages change nothing", async () => {
    const { worker, turns, done, cancel } = start();
    booted(worker);
    worker.emit({ type: "ready" });
    worker.emit(turnMsg(1));
    cancel();
    expect(await done).toEqual({ kind: "cancelled", log: "1:w-" });
    cancel();
    worker.emit(turnMsg(2));
    await vi.advanceTimersByTimeAsync(RUN_MS * 2);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(turns).toHaveLength(1);
  });

  it("returns no-worker when none can be made, and never builds a fallback", async () => {
    const none = runInSandbox(REQ, vi.fn(), () => null);
    expect(await none.done).toEqual({ kind: "no-worker" });
    none.cancel();

    const blocked = runInSandbox(REQ, vi.fn(), () => {
      throw new Error("SecurityError");
    });
    expect(await blocked.done).toEqual({ kind: "no-worker" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns no-worker by default where the environment has no Worker", async () => {
    vi.stubGlobal("Worker", undefined);
    expect(await runInSandbox(REQ, vi.fn()).done).toEqual({ kind: "no-worker" });
  });

  it("ends as a crash when the request cannot be posted", async () => {
    const worker = new FakeWorker();
    worker.postMessage.mockImplementation(() => {
      throw new Error("DataCloneError");
    });
    const run = runInSandbox(REQ, vi.fn(), () => worker as unknown as Worker);
    expect(await run.done).toEqual({ kind: "crash", log: "1:" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
