import { NextRequest, NextResponse } from "next/server";
import { logWarn } from "@/lib/log";
import { safeJsonParseServer } from "@/lib/safe-json-server";
import { guardRequest } from "@/lib/route-guard";

export const runtime = "nodejs";

/**
 * Sentry envelope tunnel: the browser SDK posts its envelopes here
 * (`tunnel: "/monitoring"` in instrumentation-client.ts) and this route
 * relays them to self-hosted Sentry.
 *
 * Hand-rolled instead of withSentryConfig's `tunnelRoute` option because the
 * SDK's generated rewrite only targets `*.ingest.sentry.io` (SaaS); our ingest
 * host is sentry.devino.ca, which visitors' networks cannot necessarily reach
 * and ad blockers would eat anyway — this server forwards over the home
 * network / tailnet instead.
 */

// Must match the DSN in instrumentation-client.ts. The first envelope line
// names the DSN it was created for; anything else is refused so this route
// cannot be used as an open relay.
const ALLOWED_DSN = "https://fd4e552a55f694418e7471d92de7873a@sentry.devino.ca/35";
const INGEST_URL = "https://sentry.devino.ca/api/35/envelope/";
// Error/transaction envelopes are a few KB; session-replay segments (a compressed binary
// `replay_recording` item next to a `replay_event`) run to hundreds of KB, and a segment
// carrying a full DOM snapshot can pass 1 MiB, so the cap is sized for those.
const MAX_ENVELOPE_BYTES = 5 * 1024 * 1024;
const NEWLINE = 0x0a;
// Two deadlines, one per hop. The browser's upload must finish within BODY_READ_TIMEOUT_MS
// (a stalled or trickling client would otherwise hold the handler open with no bound at all),
// and the relay to Sentry within UPSTREAM_TIMEOUT_MS (unchanged from the original single 8s).
const BODY_READ_TIMEOUT_MS = 10_000;
const UPSTREAM_TIMEOUT_MS = 8000;

class BodyTimeoutError extends Error {}

/** request.arrayBuffer() under a deadline; rejects with BodyTimeoutError when it expires. */
async function readBodyWithDeadline(request: NextRequest): Promise<Uint8Array<ArrayBuffer>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new BodyTimeoutError("request body read timed out")),
      BODY_READ_TIMEOUT_MS,
    );
  });
  try {
    return new Uint8Array(await Promise.race([request.arrayBuffer(), deadline]));
  } finally {
    clearTimeout(timer);
  }
}

/** Timeout (AbortSignal.timeout) vs everything else (DNS, TLS, reset, refused). */
function failureCause(err: unknown): "timeout" | "network" {
  // Read `name` structurally: AbortSignal.timeout rejects with a DOMException, which is not an
  // `instanceof Error` in every realm (jsdom's, notably).
  const name =
    typeof err === "object" && err !== null ? (err as { name?: unknown }).name : undefined;
  return name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
}

export async function POST(request: NextRequest) {
  const { response: blocked } = guardRequest(request, {
    key: "monitoring",
    limit: 60,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

  // Read bytes, never text: a replay_recording item is compressed binary, and decoding the
  // body as UTF-8 would replace its invalid sequences and corrupt the replay in transit.
  const readStarted = performance.now();
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = await readBodyWithDeadline(request);
  } catch (err) {
    logWarn("monitoring", "request body read timed out", {
      cause: "body-timeout",
      durationMs: Math.round(performance.now() - readStarted),
      error: err instanceof Error ? err.message : String(err),
    });
    return new NextResponse(null, { status: 408 });
  }
  if (body.byteLength > MAX_ENVELOPE_BYTES) {
    return NextResponse.json({ error: "envelope too large" }, { status: 413 });
  }

  // Envelope format: first newline-delimited line is a JSON header with `dsn`. Only that
  // line is decoded; everything after it is forwarded untouched.
  const newline = body.indexOf(NEWLINE);
  const headerLine = new TextDecoder().decode(newline === -1 ? body : body.subarray(0, newline));
  const header = safeJsonParseServer<{ dsn?: string }>(headerLine, "monitoring.envelope");
  if (!header) {
    return NextResponse.json({ error: "invalid envelope" }, { status: 400 });
  }
  if (header.dsn !== ALLOWED_DSN) {
    return NextResponse.json({ error: "unknown dsn" }, { status: 403 });
  }

  const started = performance.now();
  try {
    const upstream = await fetch(INGEST_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-sentry-envelope" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    // A 5xx or 429 from Sentry reaches the browser as-is; log it too so an ingest-side outage
    // is distinguishable from a tunnel-side one. Other 4xx are the SDK's own doing (dropped
    // envelope, bad payload) and would only be noise.
    if (upstream.status >= 500 || upstream.status === 429) {
      logWarn("monitoring", "envelope relay got an error status", {
        cause: "upstream-status",
        status: upstream.status,
        durationMs: Math.round(performance.now() - started),
        bytes: body.byteLength,
      });
    }
    return new NextResponse(null, { status: upstream.status });
  } catch (err) {
    // logWarn, not captureException: if the tunnel cannot reach Sentry, the
    // server-side capture path is likely down too — console is the sink that
    // still works, and each failure is one bounded warning, not a loop.
    const cause = failureCause(err);
    logWarn("monitoring", "envelope relay to Sentry failed", {
      cause,
      durationMs: Math.round(performance.now() - started),
      bytes: body.byteLength,
      error: err instanceof Error ? err.message : String(err),
    });
    return new NextResponse(null, { status: cause === "timeout" ? 504 : 502 });
  }
}
