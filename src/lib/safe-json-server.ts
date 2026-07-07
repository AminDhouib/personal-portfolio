/**
 * Server-side `safeJsonParse`: identical contract, but parse failures are
 * reported through `captureException` (console + Sentry + PostHog) instead of
 * the browser-only `reportError` global, which no server SDK listens to (NF-1).
 *
 * Server-only by construction: importing `@/lib/log` pulls in posthog-node,
 * which fails any client bundle at build time — misuse cannot ship silently.
 */

import { captureException } from "@/lib/log";
import { safeJsonParse } from "@/lib/safe-json";

export function safeJsonParseServer<T = unknown>(
  text: string,
  scope: string,
  fallback: T | null = null,
): T | null {
  return safeJsonParse(text, scope, fallback, captureException);
}
