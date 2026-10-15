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

export async function POST(request: NextRequest) {
  const { response: blocked } = guardRequest(request, {
    key: "monitoring",
    limit: 60,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

  // Read bytes, never text: a replay_recording item is compressed binary, and decoding the
  // body as UTF-8 would replace its invalid sequences and corrupt the replay in transit.
  const body = new Uint8Array(await request.arrayBuffer());
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
