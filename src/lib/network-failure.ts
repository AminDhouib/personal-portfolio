/**
 * A fetch that never got a response (offline, an ad blocker or a firewall dropping the request).
 * Browsers throw a TypeError whose text differs by engine. Callers that already degrade to a
 * visible failure state skip `reportError` for it: the global reportError reaches window.onerror
 * and Sentry as an unhandled "Failed to fetch" for something the visitor's network caused.
 * Timeouts, aborts and any other error (including a TypeError with a different message) are not
 * network failures here and stay reported. DESIGN.md's register explains why.
 */
export function isNetworkFailure(err: unknown): boolean {
  return (
    err instanceof TypeError &&
    /failed to fetch|networkerror|load failed|network request failed/i.test(err.message)
  );
}
