import * as Sentry from "@sentry/nextjs";

// A DSN is a public identifier, not a secret — it ships in every browser
// bundle by design. It is committed as a constant because a bare
// `process.env.SENTRY_DSN` read compiles to `undefined` in client code (only
// static NEXT_PUBLIC_* member expressions are inlined), which is exactly the
// bug that kept client-side Sentry dormant. Must match ALLOWED_DSN in
// src/app/monitoring/route.ts.
const SENTRY_DSN = "https://fd4e552a55f694418e7471d92de7873a@sentry.devino.ca/35";

Sentry.init({
  dsn: SENTRY_DSN,
  // Local dev would pollute the project with work-in-progress errors.
  enabled: process.env.NODE_ENV === "production",
  // sentry.devino.ca is not reachable from visitors' networks (and ad blockers
  // eat direct Sentry calls). Envelopes go to the same-origin /monitoring
  // relay, which forwards them server-side over the home network / tailnet.
  tunnel: "/monitoring",
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  environment: process.env.NODE_ENV,
});

// App Router navigation instrumentation: Next.js calls this on every
// client-side route transition so Sentry can tie spans to the originating
// navigation. The export name is required by @sentry/nextjs.
// captureRouterTransitionStart is a client-only export; the import/namespace
// resolver sees @sentry/nextjs's server build (where it is absent) and false-
// positives. Next.js compiles this file into the client bundle, where it exists.
// oxlint-disable-next-line import/namespace -- client-only Sentry export, absent from the resolved server build
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
