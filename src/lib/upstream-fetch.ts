/**
 * RC-10: a `fetch`-compatible wrapper that enforces a wall-clock deadline on
 * every call it makes. The deadline's AbortSignal.timeout() is created ONCE,
 * inside createDeadlineFetch itself -- so calling this once per request
 * handler yields a single deadline shared across every upstream call that
 * handler makes, not a fresh per-call timeout. Any per-call `init.signal`
 * (from the caller) and an optional constructor-level `signal` (e.g. the
 * inbound request's own AbortSignal, for client-disconnect propagation) are
 * merged via AbortSignal.any -- never overwritten.
 */
export function createDeadlineFetch(opts: {
  timeoutMs: number;
  signal?: AbortSignal;
  base?: typeof fetch;
}): typeof fetch {
  const base = opts.base ?? fetch;
  const deadline = AbortSignal.timeout(opts.timeoutMs);
  return (input, init) => {
    const signals = [deadline, opts.signal, init?.signal].filter((s): s is AbortSignal =>
      Boolean(s),
    );
    return base(input, { ...init, signal: AbortSignal.any(signals) });
  };
}
