import { describe, it, expect, vi } from "vitest";
import { createDeadlineFetch } from "../upstream-fetch";

// AbortSignal.timeout() schedules via a Node-internal timer that vi's fake
// timers do not intercept (verified against this repo's vitest 4.1.4). These
// tests use short REAL timeouts instead of vi.useFakeTimers -- see
// audit/plans/P3.md's vitest-quirks amendment.

function neverSettles(): Promise<Response> {
  return new Promise(() => {
    // intentionally never resolves/rejects; only the abort signal matters here
  });
}

describe("createDeadlineFetch", () => {
  it("aborts the call's signal once timeoutMs elapses", async () => {
    let sawSignal: AbortSignal | undefined;
    const base = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      sawSignal = init?.signal ?? undefined;
      return neverSettles();
    });
    const fetchWithDeadline = createDeadlineFetch({ timeoutMs: 30, base });

    void fetchWithDeadline("https://example.test");
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(sawSignal?.aborted).toBe(true);
  });

  it("merges a constructor-level signal so aborting it aborts the call", () => {
    const controller = new AbortController();
    let sawSignal: AbortSignal | undefined;
    const base = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      sawSignal = init?.signal ?? undefined;
      return neverSettles();
    });
    const fetchWithDeadline = createDeadlineFetch({
      timeoutMs: 10_000,
      signal: controller.signal,
      base,
    });

    void fetchWithDeadline("https://example.test");
    expect(sawSignal?.aborted).toBe(false);

    controller.abort();
    expect(sawSignal?.aborted).toBe(true);
  });

  it("merges a per-call init.signal so aborting it aborts the call", () => {
    const controller = new AbortController();
    let sawSignal: AbortSignal | undefined;
    const base = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      sawSignal = init?.signal ?? undefined;
      return neverSettles();
    });
    const fetchWithDeadline = createDeadlineFetch({ timeoutMs: 10_000, base });

    void fetchWithDeadline("https://example.test", { signal: controller.signal });
    expect(sawSignal?.aborted).toBe(false);

    controller.abort();
    expect(sawSignal?.aborted).toBe(true);
  });

  it("passes the base response through untouched on a normal fast call", async () => {
    const response = new Response("ok", { status: 200 });
    const base = vi.fn().mockResolvedValue(response);
    const fetchWithDeadline = createDeadlineFetch({ timeoutMs: 10_000, base });

    const result = await fetchWithDeadline("https://example.test");

    expect(result).toBe(response);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("defaults to the global fetch when no base is provided", () => {
    const fetchWithDeadline = createDeadlineFetch({ timeoutMs: 10_000 });
    expect(typeof fetchWithDeadline).toBe("function");
  });
});
