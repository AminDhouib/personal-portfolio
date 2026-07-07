import { NextRequest, NextResponse } from "next/server";
import { logWarn } from "@/lib/log";
import { safeJsonParse } from "@/lib/safe-json";
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
// Replays are disabled; error/transaction envelopes are a few KB each.
const MAX_ENVELOPE_BYTES = 1024 * 1024;

export async function POST(request: NextRequest) {
  const blocked = guardRequest(request, { key: "monitoring", limit: 60, windowMs: 60_000 });
  if (blocked) return blocked;

  const body = await request.text();
  if (body.length > MAX_ENVELOPE_BYTES) {
    return NextResponse.json({ error: "envelope too large" }, { status: 413 });
  }

  // Envelope format: first newline-delimited line is a JSON header with `dsn`.
  const newline = body.indexOf("\n");
  const headerLine = newline === -1 ? body : body.slice(0, newline);
  const header = safeJsonParse<{ dsn?: string }>(headerLine, "monitoring:envelope-header");
  if (header?.dsn !== ALLOWED_DSN) {
    return NextResponse.json({ error: "unknown dsn" }, { status: 403 });
  }

  try {
    const upstream = await fetch(INGEST_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-sentry-envelope" },
      signal: AbortSignal.timeout(8000),
    });
    return new NextResponse(null, { status: upstream.status });
  } catch (err) {
    // logWarn, not captureException: if the tunnel cannot reach Sentry, the
    // server-side capture path is likely down too — console is the sink that
    // still works, and each failure is one bounded warning, not a loop.
    logWarn("monitoring", "envelope relay to Sentry failed", err);
    return new NextResponse(null, { status: 502 });
  }
}
