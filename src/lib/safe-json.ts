/**
 * The single sanctioned place to call `JSON.parse`.
 *
 * `no-restricted-syntax` bans `JSON.parse` everywhere else so that malformed
 * input can never crash a request or be swallowed silently. Failures are
 * routed to the exception tracker (via {@link captureException}) and the caller
 * gets an explicit `null`/fallback instead of a throw. This is the
 * "report, don't silently corrupt" boundary for JSONL reads (RC-2 adjacent).
 */
import { captureException } from "./log";

/**
 * Parse `text` as JSON, never throwing. On failure the error is reported under
 * `scope` and `fallback` (default `null`) is returned, so corrupt data is
 * visible in the tracker instead of silently skipped.
 *
 * The generic `T` names the expected shape at the call site; it is an assertion,
 * not a validation. For untrusted input, parse the result with a zod schema.
 */
export function safeJsonParse<T = unknown>(
  text: string,
  scope: string,
  fallback: T | null = null,
): T | null {
  try {
    // eslint-disable-next-line no-restricted-syntax -- this wrapper is the one allowed JSON.parse site
    return JSON.parse(text) as T;
  } catch (err) {
    captureException(scope, err);
    return fallback;
  }
}
