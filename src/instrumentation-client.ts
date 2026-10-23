import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import { isLoopbackHost } from "@/lib/loopback-host";
import { SENTRY_DATA_COLLECTION, SENTRY_TRACE_LIFECYCLE } from "@/lib/sentry-options";
import { POSTHOG_PROXY_PATH, posthogUpstreamHost } from "@/lib/posthog-proxy";

// A DSN is a public identifier, not a secret — it ships in every browser
// bundle by design. It is committed as a constant because a bare
// `process.env.SENTRY_DSN` read compiles to `undefined` in client code (only
// static NEXT_PUBLIC_* member expressions are inlined), which is exactly the
// bug that kept client-side Sentry dormant. Must match ALLOWED_DSN in
// src/app/monitoring/route.ts.
const SENTRY_DSN = "https://fd4e552a55f694418e7471d92de7873a@sentry.devino.ca/35";

// On only for a production build served from a real host. Local dev would pollute the project
// with work-in-progress errors, and CI (Lighthouse, E2E) and the local docker compose stack run
// the same production build on localhost, so a loopback hostname is decided at runtime here: the
// build itself is identical to what ships to amindhou.com.
const SENTRY_ENABLED =
  process.env.NODE_ENV === "production" && !isLoopbackHost(window.location.hostname);

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: SENTRY_ENABLED,
  // sentry.devino.ca is not reachable from visitors' networks (and ad blockers
  // eat direct Sentry calls). Envelopes go to the same-origin /monitoring
  // relay, which forwards them server-side over the home network / tailnet.
  tunnel: "/monitoring",
  tracesSampleRate: 0.1,
  // Session replay: 10% of sessions are recorded whole, and every session that hits an
  // error is kept (the SDK buffers in memory and uploads only when an error fires). Replays
  // are the largest payload type this self-hosted Sentry ingests, so the session rate is the
  // knob to lower if storage grows.
  // The integration itself is added below, on first interaction.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  environment: process.env.NODE_ENV,
  traceLifecycle: SENTRY_TRACE_LIFECYCLE,
  dataCollection: SENTRY_DATA_COLLECTION,
});

// Replay stays out of the first-load bundle: the dynamic import puts the recorder in its own
// chunk (about 100 KB gzipped), fetched only after the visitor's first interaction (pointer,
// touch, key or scroll) and then on an idle callback. Lighthouse and crawlers never interact,
// so audits see no recorder cost and bots do not spend the replay quota, while a real visit
// starts recording within moments. Replay envelopes travel through the /monitoring tunnel
// like every other one. The cost is that a session's first moments are not recorded.
// Privacy: this is a public site, so text and media are recorded as is, but every input is
// masked (lead details typed into the AI chat, game inputs). Anything marked `.ph-sensitive`
// is masked too and `.ph-no-capture` is blocked outright, the same two classes PostHog's
// recorder honors, so one marker protects an element in both tools.
function addReplayIntegration(): void {
  void import("@sentry/nextjs")
    .then(({ addIntegration, replayIntegration }) => {
      addIntegration(
        replayIntegration({
          maskAllInputs: true,
          maskAllText: false,
          blockAllMedia: false,
          mask: [".ph-sensitive"],
          block: [".ph-no-capture"],
        }),
      );
    })
    .catch((err: unknown) => {
      reportError(err);
    });
}

const REPLAY_START_EVENTS = ["pointerdown", "pointermove", "touchstart", "keydown", "scroll"];

if (SENTRY_ENABLED) {
  const start = () => {
    for (const type of REPLAY_START_EVENTS) window.removeEventListener(type, start);
    if ("requestIdleCallback" in window) window.requestIdleCallback(addReplayIntegration);
    else setTimeout(addReplayIntegration, 200);
  };
  for (const type of REPLAY_START_EVENTS) {
    window.addEventListener(type, start, { passive: true });
  }
}

// Client-side product analytics. Gated on NEXT_PUBLIC_POSTHOG_KEY so it stays a
// no-op in local dev and any deploy that has not set the key. The literal static
// process.env read is required for Next.js to inline it into the client bundle --
// a dynamic env lookup compiles to undefined here (see src/env.ts). Error
// capture stays with Sentry (above) and server-side PostHog (src/lib/log.ts);
// this client is product analytics only.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    // First-party: the SDK posts to a same-origin path that next.config.ts rewrites to PostHog
    // (and src/proxy.ts hops capture over the host's internal route), so ad blockers have no
    // posthog host to match. ui_host stays the real instance so toolbar and "open in PostHog"
    // links point at the actual app. The static read is what Next inlines (see above).
    api_host: POSTHOG_PROXY_PATH,
    ui_host: posthogUpstreamHost(process.env.NEXT_PUBLIC_POSTHOG_HOST),
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    person_profiles: "identified_only",
    // posthog-js 1.438 defaults this to "fallback": it injects /static/<version>/*.js into <body>
    // before hydration, the PostHog host redirects that path to /login, and on the failure the SDK
    // removes the node, which React had hydrated a fiber onto, so a later navigation threw
    // insertBefore/removeChild NotFoundError. false keeps the legacy /static/<kind>.js?v=<version>
    // URL, which loads and is never removed.
    strict_script_versioning: false,
    // Session recording is switched on and sampled (about 10%) server-side, in PostHog
    // project 22's settings, not here; do not add disable_session_recording. These are the
    // masking rules for whatever the project records: every input is masked, and anything
    // marked `.ph-sensitive` has its text masked (the class Sentry's replay masks as well).
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: ".ph-sensitive",
    },
  });
}

// App Router navigation instrumentation: Next.js calls this on every
// client-side route transition so Sentry can tie spans to the originating
// navigation. The export name is required by @sentry/nextjs.
// captureRouterTransitionStart is a client-only export; the import/namespace
// resolver sees @sentry/nextjs's server build (where it is absent) and false-
// positives. Next.js compiles this file into the client bundle, where it exists.
// oxlint-disable-next-line import/namespace -- client-only Sentry export, absent from the resolved server build
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
