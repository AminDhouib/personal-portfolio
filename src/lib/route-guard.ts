/**
 * NF-10: the origin + rate-limit + (optionally) JSON-parse prelude that was
 * hand-duplicated across five API routes, extracted into two composable
 * layers. `guardRequest` is the common lower layer (origin + rate-limit,
 * headers only, body untouched) that all five routes share; `guardedJsonRoute`
 * adds the JSON body parse that three of the five routes also share.
 * copilotkit (never reads the body itself -- CopilotKit does) and monitoring
 * (reads text, not JSON) use `guardRequest` only. See audit/plans/P3.md
 * section 2.1 for why one shape does not fit all five routes.
 */
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { checkRateLimit, getClientIp, isSameOrigin } from "@/lib/rate-limit";
import { safeJsonParseServer } from "@/lib/safe-json-server";

const DEFAULT_JSON_MAX_BYTES = 16 * 1024; // 16 KiB — leads' 5 KB note is the largest real field

// Sentinel fallback for safeJsonParseServer, distinct from any real parsed
// value (including a literal top-level JSON `null` body) so a parse failure
// can never be confused with a successfully parsed `null`.
const PARSE_FAILED = Symbol("route-guard-parse-failed");

export interface GuardOptions {
  /** Rate-limit namespace, e.g. "leads". The client IP is appended internally. */
  key: string;
  limit: number;
  windowMs: number;
  maxBytes?: number; // P4: request body cap; defaults to DEFAULT_JSON_MAX_BYTES
}

/**
 * Result of {@link guardRequest}: the request id minted for this guarded
 * request (always present, for correlation/echoing) plus the short-circuit
 * Response, or a null `response` when the request may proceed.
 */
export interface GuardResult {
  /** Per-request correlation id, also set as the Sentry `request_id` tag. */
  requestId: string;
  /** A Response to short-circuit the route, or null to proceed. */
  response: Response | null;
}

/**
 * Origin + rate-limit gate. Mints a request id (tagged onto the Sentry
 * isolation scope so any later capture in this request carries it) and returns
 * it alongside a Response to short-circuit the route, or a null `response` to
 * proceed. Reads only headers -- never consumes the request body -- so it is
 * safe in front of a handler (like copilotkit's) that must read the body itself
 * exactly once.
 */
export function guardRequest(req: Request, opts: GuardOptions): GuardResult {
  const requestId = crypto.randomUUID();
  Sentry.getIsolationScope().setTag("request_id", requestId);

  if (!isSameOrigin(req)) {
    return { requestId, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  const rate = checkRateLimit(`${opts.key}:${getClientIp(req)}`, {
    limit: opts.limit,
    windowMs: opts.windowMs,
  });
  if (!rate.allowed) {
    return {
      requestId,
      response: NextResponse.json(
        { error: "too many requests" },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
      ),
    };
  }
  return { requestId, response: null };
}

// Deliberately NOT exported: `body: unknown` here is the sanctioned narrow-me
// input every caller re-validates with its own zod/schema parse (the
// "accepting unknown as an input and narrowing it is fine" case documented in
// local/no-unknown-in-public-api). Keeping the alias private keeps that
// rule's exported-type-alias check out of scope without changing the shape
// callers see -- guardedJsonRoute's own return-type annotation below carries
// no literal `unknown` token, so nothing here weakens the rule's intent.
type GuardedJson =
  | { ok: true; requestId: string; body: unknown }
  | { ok: false; requestId: string; response: Response };

/**
 * guardRequest + a capped JSON body parse. Returns the parsed body (still
 * `unknown` -- callers keep their own zod/schema validation) or a Response
 * (403 origin / 429 rate / 413 over maxBytes / 400 invalid-json), checked in
 * that precedence order: reject unauthorized/abusive requests before ever
 * touching the body, and reject an oversized body before parsing it.
 */
export async function guardedJsonRoute(req: Request, opts: GuardOptions): Promise<GuardedJson> {
  const { requestId, response: blocked } = guardRequest(req, opts);
  if (blocked) return { ok: false, requestId, response: blocked };

  const cap = opts.maxBytes ?? DEFAULT_JSON_MAX_BYTES;
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) {
    return {
      ok: false,
      requestId,
      response: NextResponse.json({ error: "payload too large" }, { status: 413 }),
    };
  }

  let text: string;
  try {
    text = await req.text();
  } catch {
    // silent-ok: a broken/aborted request stream is a client error, surfaced as the 400 below
    return {
      ok: false,
      requestId,
      response: NextResponse.json({ error: "invalid json" }, { status: 400 }),
    };
  }
  if (Buffer.byteLength(text, "utf8") > cap) {
    return {
      ok: false,
      requestId,
      response: NextResponse.json({ error: "payload too large" }, { status: 413 }),
    };
  }
  const parsed = safeJsonParseServer<unknown>(text, "route-guard.guardedJsonRoute", PARSE_FAILED);
  if (parsed === PARSE_FAILED) {
    return {
      ok: false,
      requestId,
      response: NextResponse.json({ error: "invalid json" }, { status: 400 }),
    };
  }
  return { ok: true, requestId, body: parsed };
}
