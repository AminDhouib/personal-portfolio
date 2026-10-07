import { describe, it, expect, vi, afterEach } from "vitest";
import { createSolveClient } from "../solve-client";
import { solve, type SolverInput } from "../solver";

// A real layout, so the clues are consistent.
const LAYOUT = "22V2V1VVV11VV12V1V222122V";
function inputFor(layout: string, shown: number[] = []): SolverInput {
  const cells = layout.split("").map((c) => (c === "V" ? "V" : Number(c)));
  const line = (idx: number[]) => ({
    coins: idx.reduce((s, i) => s + (cells[i] === "V" ? 0 : Number(cells[i])), 0),
    voltorbs: idx.filter((i) => cells[i] === "V").length,
  });
  const range = [0, 1, 2, 3, 4];
  return {
    rows: range.map((r) => line(range.map((c) => r * 5 + c))),
    cols: range.map((c) => line(range.map((r) => r * 5 + c))),
    revealed: cells.map((v, i) => (shown.includes(i) && v !== "V" ? (v as 1 | 2 | 3) : null)),
    level: 5,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createSolveClient (inline fallback)", () => {
  it("solves off the call stack and matches the solver exactly", async () => {
    vi.useFakeTimers();
    const client = createSolveClient(null);
    const input = inputFor(LAYOUT);
    const pending = client.solve(input);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false); // deferred, not run inside the caller
    await vi.runAllTimersAsync();
    expect(await pending).toEqual(solve(input));
    client.dispose();
  });

  it("is latest-wins: a superseded request resolves null", async () => {
    vi.useFakeTimers();
    const client = createSolveClient(null);
    const first = client.solve(inputFor(LAYOUT));
    const second = client.solve(inputFor(LAYOUT, [0]));
    await vi.runAllTimersAsync();
    expect(await first).toBeNull();
    expect(await second).toEqual(solve(inputFor(LAYOUT, [0])));
    client.dispose();
  });

  it("resolves null for a request pending at dispose", async () => {
    vi.useFakeTimers();
    const client = createSolveClient(null);
    const pending = client.solve(inputFor(LAYOUT));
    client.dispose();
    await vi.runAllTimersAsync();
    expect(await pending).toBeNull();
  });
});

describe("createSolveClient (worker)", () => {
  class FakeWorker {
    static last: FakeWorker | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    posted: unknown[] = [];
    terminated = false;
    constructor() {
      FakeWorker.last = this;
    }
    postMessage(m: unknown) {
      this.posted.push(m);
    }
    terminate() {
      this.terminated = true;
    }
  }
  const make = () => new FakeWorker() as unknown as Worker;

  it("posts the request and resolves with the worker's answer", async () => {
    const client = createSolveClient(make);
    const input = inputFor(LAYOUT);
    const pending = client.solve(input);
    const worker = FakeWorker.last!;
    const msg = worker.posted[0] as { id: number; input: SolverInput };
    expect(msg.input).toEqual(input);
    const result = solve(input);
    worker.onmessage?.({ data: { id: msg.id, result } } as MessageEvent);
    expect(await pending).toEqual(result);
    client.dispose();
    expect(worker.terminated).toBe(true);
  });

  it("ignores a stale answer", async () => {
    const client = createSolveClient(make);
    const first = client.solve(inputFor(LAYOUT));
    const second = client.solve(inputFor(LAYOUT, [0]));
    const worker = FakeWorker.last!;
    const [m1, m2] = worker.posted as { id: number; input: SolverInput }[];
    worker.onmessage?.({ data: { id: m1!.id, result: solve(m1!.input) } } as MessageEvent);
    expect(await first).toBeNull();
    worker.onmessage?.({ data: { id: m2!.id, result: solve(m2!.input) } } as MessageEvent);
    expect(await second).toEqual(solve(inputFor(LAYOUT, [0])));
    client.dispose();
  });

  it("falls back to the inline solve when the worker errors", async () => {
    vi.useFakeTimers();
    const client = createSolveClient(make);
    const input = inputFor(LAYOUT);
    const pending = client.solve(input);
    FakeWorker.last!.onerror?.(new Event("error"));
    await vi.runAllTimersAsync();
    expect(await pending).toEqual(solve(input));
    // and later requests no longer touch the dead worker
    const later = client.solve(input);
    await vi.runAllTimersAsync();
    expect(await later).toEqual(solve(input));
    client.dispose();
  });

  it("falls back at once when the worker cannot be constructed", async () => {
    vi.useFakeTimers();
    const client = createSolveClient(() => {
      throw new Error("no workers here");
    });
    const input = inputFor(LAYOUT);
    const pending = client.solve(input);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual(solve(input));
    client.dispose();
  });
});
