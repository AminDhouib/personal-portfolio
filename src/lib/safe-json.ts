/**
 * The single sanctioned place to call `JSON.parse`.
 *
 * `no-restricted-syntax` bans `JSON.parse` everywhere else so that malformed
 * input can never crash a request or be swallowed silently. Failures are
 * reported via console.error (universal, works in both server and client
 * bundles) and the caller gets an explicit `null`/fallback instead of a throw.
 *
 * This module must stay free of server-only imports (posthog-node, node:fs)
 * because it is used in client components (profile.ts, game engines).
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
    console.error(`[${scope}] safeJsonParse failed:`, err);
    if (typeof reportError === "function") reportError(err);
    return fallback;
  }
}
