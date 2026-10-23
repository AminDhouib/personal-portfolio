// Sentry v11 init options that hold the v10 behavior. Shared by the server/edge init
// (src/instrumentation.ts) and the browser init (src/instrumentation-client.ts), so the two cannot
// drift. Pure constants: this module ships in the client bundle (the only import is type-only).
import type { BrowserOptions } from "@sentry/nextjs";

// v11 replaced `sendDefaultPii` with `dataCollection`, and an unset `dataCollection` now collects
// user info (including the IP), cookies and request/response bodies. This is the v10 default
// spelled out, as the migration guide gives it: collect none of those, and keep forwarding, IP
// and user headers out of the headers and query string that are still captured.
const SENSITIVE_HEADER_PARTS = ["forwarded", "-ip", "remote-", "via", "-user"];

export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: SENSITIVE_HEADER_PARTS },
    response: { deny: SENSITIVE_HEADER_PARTS },
  },
  httpBodies: [],
  urlQueryParams: { deny: SENSITIVE_HEADER_PARTS },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
} satisfies NonNullable<BrowserOptions["dataCollection"]>;

// v11 streams spans in batches (span envelope items) by default. "static" keeps tracing on the
// v10 transaction model: transactions still go out as transaction envelopes. It is not a
// span-free setup: the browser still sends the INP web vital as a small standalone span item. The
// self-hosted Sentry at sentry.devino.ca (26.10.0, past the 26.4.2 floor the v11 guide names)
// probably ingests streamed spans, but that is unconfirmed, so keep static until it is, then
// revisit dropping it; the static lifecycle is slated for removal in a later SDK major.
export const SENTRY_TRACE_LIFECYCLE = "static" as const;
