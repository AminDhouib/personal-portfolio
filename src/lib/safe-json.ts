/**
 * The single sanctioned place to call `JSON.parse`.
 *
 * `no-restricted-syntax` bans `JSON.parse` everywhere else so that malformed
 * input can never crash a request or be swallowed silently. The caller always
 * gets an explicit `null`/fallback instead of a throw.
 *
 * Reporting is environment-specific (NF-1):
 * - Client callers use this module directly: failures go to console.error +
 *   the browser `reportError` global, which reaches window.onerror and the
 *   Sentry client SDK.
 * - Server callers must use `safeJsonParseServer` (safe-json-server.ts): Node
 *   also has a global `reportError`, but nothing routes it to Sentry/PostHog
 *   there, so server code injects `captureException` via `report` instead.
 *
 * This module must stay free of server-only imports (posthog-node, node:fs)
 * because it is bundled into client components (profile.ts, game engines).
 */

export function safeJsonParse<T = unknown>(
  text: string,
  scope: string,
  fallback: T | null = null,
  report?: (scope: string, err: unknown) => void,
): T | null {
  try {
    // eslint-disable-next-line no-restricted-syntax -- this wrapper is the one allowed JSON.parse site
    return JSON.parse(text) as T;
  } catch (err) {
    if (report) {
      report(scope, err);
    } else {
      console.error(`[${scope}] safeJsonParse failed:`, err);
      if (typeof reportError === "function") reportError(err);
    }
    return fallback;
  }
}
