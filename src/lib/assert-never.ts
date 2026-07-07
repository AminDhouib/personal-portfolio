/**
 * Exhaustiveness guard. Because the parameter is typed `never`, a caller that
 * reaches it with a still-inhabited union member fails to compile — a missing
 * switch/branch becomes a build error (tsc + next build), not a dev-time-only
 * lint warning. If an out-of-contract value reaches it at runtime (a widened
 * type, bad data, a bypassed validator), it throws instead of failing silently,
 * so the nearest error boundary can surface and report it.
 */
export function assertNever(value: never, context?: string): never {
  throw new Error(
    `assertNever: unhandled value ${JSON.stringify(value)}${context ? ` (${context})` : ""}`,
  );
}
