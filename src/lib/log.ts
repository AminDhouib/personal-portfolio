/**
 * Structured logging + optional server-side exception capture.
 *
 * Server-side only (relies on process.env and, for capture, a Node PostHog
 * client) — do not import this from client components.
 */

import { PostHog } from "posthog-node";
import * as Sentry from "@sentry/nextjs";
import { env } from "@/env";

// Stable identity for server-originated events; there's no per-visitor
// distinct ID to attach these to.
const SERVER_DISTINCT_ID = "server";

/** Message + first stack line only — never dump a full stack into a log line. */
function renderDetail(detail: unknown): string {
  if (detail instanceof Error) {
    const firstStackLine = detail.stack?.split("\n")[1]?.trim();
    return firstStackLine ? `${detail.message} (${firstStackLine})` : detail.message;
  }
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    // silent-ok: this is the logger's own formatter; a stringify failure (e.g.
    // circular ref) falls back to String() -- reporting here would recurse.
    return String(detail);
  }
}

export function logWarn(scope: string, message: string, detail?: unknown): void {
  const suffix = detail === undefined ? "" : ` :: ${renderDetail(detail)}`;
  console.warn(`[${scope}] ${message}${suffix}`);
}

export function logError(scope: string, message: string, error?: unknown): void {
  const suffix = error === undefined ? "" : ` :: ${renderDetail(error)}`;
  console.error(`[${scope}] ${message}${suffix}`);
}

// Lazily-constructed singleton, cached only once successfully built. Missing
// config or a construction failure is cheap to re-check, so it's never
// memoized — that way config picked up later in process lifetime still works.
let posthogClient: PostHog | null = null;

function getPostHogClient(): PostHog | null {
  if (posthogClient) return posthogClient;

  const apiKey = env.POSTHOG_KEY;
  const host = env.POSTHOG_HOST;
  if (!apiKey || !host) return null;

  try {
    // flushAt: 1 + flushInterval: 0 flush every event immediately — this is a
    // mostly-idle server, not a high-traffic client, so batching just delays
    // (or drops, on process exit) exception delivery for no benefit.
    posthogClient = new PostHog(apiKey, { host, flushAt: 1, flushInterval: 0 });
    return posthogClient;
  } catch (err) {
    logError("posthog", "failed to construct client", err);
    return null;
  }
}

/**
 * Logs the error and, when POSTHOG_KEY/POSTHOG_HOST are both configured,
 * forwards it to PostHog as an `$exception` event tagged with `scope`. Always
 * logs; the PostHog send is the only part that's skipped when unconfigured.
 * Never throws — safe to call from any catch block.
 */
export function captureException(scope: string, error: unknown): void {
  logError(scope, "captured exception", error);

  const normalized = error instanceof Error ? error : new Error(renderDetail(error));

  Sentry.withScope((sentryScope) => {
    sentryScope.setTag("scope", scope);
    Sentry.captureException(normalized);
  });

  try {
    const client = getPostHogClient();
    if (!client) return;
    client.captureException(normalized, SERVER_DISTINCT_ID, { scope });
  } catch (captureErr) {
    logError("posthog", "captureException failed", captureErr);
  }
}
