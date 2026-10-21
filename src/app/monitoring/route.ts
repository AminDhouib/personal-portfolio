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
// Three deadlines. The browser's upload must keep making progress (an idle gap longer than
// BODY_IDLE_TIMEOUT_MS ends it) and must finish within BODY_TOTAL_TIMEOUT_MS overall, so a slow
// but moving replay upload survives while a stalled or trickling client cannot hold the handler
// open. The relay to Sentry then gets UPSTREAM_TIMEOUT_MS (unchanged from the original 8s).
// These deadlines only work because src/proxy.ts's matcher excludes /monitoring: Next buffers a
// request body in the proxy layer before the handler runs, so a matched path would answer only
// after the upload had finished. Keep the two in step (DESIGN.md's register entry).
const BODY_IDLE_TIMEOUT_MS = 10_000;
const BODY_TOTAL_TIMEOUT_MS = 30_000;
const UPSTREAM_TIMEOUT_MS = 8000;

class BodyTimeoutError extends Error {
  constructor(
    readonly deadline: "idle" | "total",
    readonly bytesReceived: number,
  ) {
    super(`request body ${deadline} deadline exceeded`);
  }
}
class BodyTooLargeError extends Error {}

/** One read, or `null` when `ms` passes first. The timer never outlives the call. */
async function readWithin(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  ms: number,
): Promise<ReadableStreamReadResult<Uint8Array> | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([reader.read(), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read the browser's body chunk by chunk: an idle deadline that resets on every chunk, an
 * overall cap, and MAX_ENVELOPE_BYTES enforced as bytes arrive (so an oversize upload is cut
 * off early instead of buffered first). The stream is cancelled on every non-success exit.
 */
async function readBody(request: NextRequest): Promise<Uint8Array<ArrayBuffer>> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const startedAt = performance.now();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const remaining = BODY_TOTAL_TIMEOUT_MS - (performance.now() - startedAt);
      const result = await readWithin(reader, Math.min(BODY_IDLE_TIMEOUT_MS, remaining));
      if (!result) {
        throw new BodyTimeoutError(remaining < BODY_IDLE_TIMEOUT_MS ? "total" : "idle", received);
      }
      if (result.done) break;
      received += result.value.byteLength;
      if (received > MAX_ENVELOPE_BYTES) throw new BodyTooLargeError("envelope too large");
      chunks.push(result.value);
    }
  } catch (err) {
    // A stream that errored is already dead; only cancel one we are abandoning. Not awaited:
    // cancelling a stalled upload can itself wait on the socket.
    if (err instanceof BodyTimeoutError || err instanceof BodyTooLargeError) {
      reader.cancel().catch((cancelErr: unknown) => {
        logWarn("monitoring", "request body cancel failed", cancelErr);
      });
    }
    throw err;
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** The declared Content-Length, or null when absent or not a number (chunked, malformed). */
function declaredLength(request: NextRequest): number | null {
  const raw = request.headers.get("content-length");
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Node's `cause.code` (ECONNREFUSED, ENOTFOUND, UND_ERR_CONNECT_TIMEOUT, ...), when present. */
function errorCode(err: unknown): string | undefined {
  const cause = typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : null;
  const code =
    typeof cause === "object" && cause !== null ? (cause as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : undefined;
}

/** Timeout (AbortSignal.timeout) vs everything else (DNS, TLS, reset, refused). */
function failureCause(err: unknown): "timeout" | "network" {
  // Read `name` structurally: AbortSignal.timeout rejects with a DOMException, which is not an
  // `instanceof Error` in every realm (jsdom's, notably).
  const name =
    typeof err === "object" && err !== null ? (err as { name?: unknown }).name : undefined;
  return name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
}

/**
 * The two headers the browser SDK reads to back off after a 429 (X-Sentry-Rate-Limits first,
 * Retry-After second), copied verbatim from upstream. Nothing else crosses, and nothing is made
 * up when upstream sent neither.
 */
function rateLimitHeaders(upstream: Headers): Headers {
  const headers = new Headers();
  for (const name of ["retry-after", "x-sentry-rate-limits"]) {
    const value = upstream.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}

export async function POST(request: NextRequest) {
  const { response: blocked } = guardRequest(request, {
    key: "monitoring",
    limit: 60,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

  // A declared length over the cap is refused before a byte is read.
  const declared = declaredLength(request);
  if (declared !== null && declared > MAX_ENVELOPE_BYTES) {
    request.body?.cancel().catch((cancelErr: unknown) => {
      logWarn("monitoring", "request body cancel failed", cancelErr);
    });
    return NextResponse.json({ error: "envelope too large" }, { status: 413 });
  }

  // Read bytes, never text: a replay_recording item is compressed binary, and decoding the
  // body as UTF-8 would replace its invalid sequences and corrupt the replay in transit.
  const readStarted = performance.now();
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = await readBody(request);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return NextResponse.json({ error: "envelope too large" }, { status: 413 });
    }
    const durationMs = Math.round(performance.now() - readStarted);
    if (err instanceof BodyTimeoutError) {
      logWarn("monitoring", "request body read timed out", {
        cause: "body-timeout",
        deadline: err.deadline,
        durationMs,
        bytes: err.bytesReceived,
        declaredBytes: declared,
      });
      return new NextResponse(null, { status: 408 });
    }
    // The client went away or the stream broke (undici "terminated", a reset): not a timeout.
    logWarn("monitoring", "request body read failed", {
      cause: "body-read-error",
      durationMs,
      error: err instanceof Error ? err.message : String(err),
      code: errorCode(err),
    });
    return new NextResponse(null, { status: 400 });
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
    return new NextResponse(null, {
      status: upstream.status,
      headers: upstream.status === 429 ? rateLimitHeaders(upstream.headers) : undefined,
    });
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
      code: errorCode(err),
    });
    return new NextResponse(null, { status: cause === "timeout" ? 504 : 502 });
  }
}
