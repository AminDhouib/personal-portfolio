import { solve, type SolverInput, type SolverResult } from "./solver";
import type { SolveRequest, SolveResponse } from "./solver-worker";

export type SolveClient = {
  /** The solver's answer, or null when a newer request (or dispose) superseded this one. */
  solve: (input: SolverInput) => Promise<SolverResult | null>;
  dispose: () => void;
};

// The `new URL(...)` has to sit inside the `new Worker(...)` call as a literal:
// that is the form Turbopack and webpack bundle as a worker chunk.
function defaultMakeWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  return new Worker(new URL("./solver-worker.ts", import.meta.url));
}

/**
 * Runs the exact solver without blocking a frame. A Web Worker does the search;
 * when there is no Worker, it cannot be built, or it errors, the same solver
 * runs inline from a setTimeout(0), so the odds still appear (a long task of
 * at most about 160 ms at round start instead of a frame-safe one). Latest wins:
 * only the newest request's answer is ever returned.
 */
export function createSolveClient(
  makeWorker: (() => Worker | null) | null = defaultMakeWorker,
): SolveClient {
  let worker: Worker | null = null;
  let broken = makeWorker === null;
  let nextId = 0;
  let latest = 0;
  const pending = new Map<number, (r: SolverResult | null) => void>();
  let timers: number[] = [];
  let lastInput: SolverInput | null = null;

  function settleAll(result: null) {
    for (const resolve of pending.values()) resolve(result);
    pending.clear();
  }

  function inline(id: number, input: SolverInput) {
    const timer = window.setTimeout(() => {
      timers = timers.filter((t) => t !== timer);
      const resolve = pending.get(id);
      if (!resolve) return;
      pending.delete(id);
      resolve(id === latest ? solve(input) : null);
    }, 0);
    timers.push(timer);
  }

  function ensureWorker(): Worker | null {
    if (broken || worker) return worker;
    try {
      worker = makeWorker ? makeWorker() : null;
    } catch {
      // silent-ok: no usable Worker (blocked, unsupported): the inline solve answers instead
      worker = null;
    }
    if (!worker) {
      broken = true;
      return null;
    }
    worker.onmessage = (e: MessageEvent<SolveResponse>) => {
      const resolve = pending.get(e.data.id);
      if (!resolve) return;
      pending.delete(e.data.id);
      resolve(e.data.id === latest ? e.data.result : null);
    };
    worker.onerror = () => {
      // The worker died (bundle failed to load, CSP): answer the newest waiting
      // request inline and let the older ones resolve null.
      broken = true;
      worker?.terminate();
      worker = null;
      for (const [id, resolve] of pending) {
        if (id !== latest) {
          resolve(null);
          pending.delete(id);
        }
      }
      if (lastInput && pending.has(latest)) inline(latest, lastInput);
    };
    return worker;
  }

  return {
    solve(input) {
      nextId += 1;
      const id = nextId;
      latest = id;
      lastInput = input;
      // Anything still waiting is superseded.
      for (const [oldId, resolve] of pending) {
        if (oldId !== id) {
          resolve(null);
          pending.delete(oldId);
        }
      }
      return new Promise<SolverResult | null>((resolve) => {
        pending.set(id, resolve);
        const w = ensureWorker();
        if (w) {
          const request: SolveRequest = { id, input };
          w.postMessage(request);
        } else {
          inline(id, input);
        }
      });
    },
    dispose() {
      for (const t of timers) window.clearTimeout(t);
      timers = [];
      worker?.terminate();
      worker = null;
      broken = true;
      settleAll(null);
    },
  };
}
