# T-6400 verdict: PORTFOLIO-Q, InvariantError "Expected RSC response, got text/plain"

Investigator: impl-pra. Date: 2026-10-22. Read-only; no code changed, no request sent to prod.

## Verdict

Most likely (b): a bot or scanner POSTing to pages with RSC or server-action style requests.
Not deploy-related. Nothing in our own code can produce it. Not certain, because Sentry holds no
request headers, user agent or IP for these events. (c), a Next.js upstream bug, is not excluded.

Issue: PORTFOLIO-Q (group 10866), org devino, project portfolio. 4 events, 0 users impacted.
First seen 2026-10-17T18:44:29Z, last seen 2026-10-21T14:56:08Z.
All four: mechanism auto.function.nextjs.on_request_error, handled=no, level=error,
environment=production, next@16.3.8 (matches the lockfile), node v22.23.1, turbopack.

## The 4 events

| # | Time (UTC) | Event id | Method and URL | Transaction | Server | App start |
|---|---|---|---|---|---|---|
| 1 | 2026-10-17T18:44:29Z | 6e7703a221f649e189d423dfe6c94de8 | POST https://amindhou.com/app | POST /_not-found/page | 7cf9016c2b5c | 2026-10-16T11:38:50Z |
| 2 | 2026-10-21T14:56:05Z | 6f758187320d4cd1b615d3334b06732f | POST https://amindhou.com/ (request_path /?_rsc=MhcDH-m6RIykZ5_o, router_path /page) | POST /page | c12d35edafb9 | 2026-10-21T11:06:01Z |
| 3 | 2026-10-21T14:56:07Z | 78d6aed0495044b182a984f64ee9cb7b | POST https://amindhou.com/app | POST /_not-found/page | c12d35edafb9 | 2026-10-21T11:06:01Z |
| 4 | 2026-10-21T14:56:08Z | f0e4b87426424beb8db16b22b5f5b981 | POST https://amindhou.com/app | POST /_not-found/page | c12d35edafb9 | 2026-10-21T11:06:01Z |

Event 1 is tagged browser=crawler. Events 2 to 4 have no browser or OS client tags. Events 2 to 4
are three requests in three seconds. `/app` is not a route the site has (it renders the 404 page).
Trace ids: event 1 dc5d93195fbc93539a4ec833ffa0e074; event 2 2a03dd67c31eec31648dc51b0a882d5a;
events 3 and 4 f7d5c842cc2484929da45d4cbede6dde and 644069090af04f0212274cf929e0bc62.

Not available: request headers (next-action, rsc, next-router-state-tree, content-type), IP, ASN,
user agent (apart from the "crawler" tag on event 1), and breadcrumbs. The SDK does not capture
them for these server errors.

## Deploy correlation

Dokploy deployments of compose hnV_k4WYHOmodXzsvQeDk (read-only listing, which starts at 2026-10-19):
- 2026-10-21 11:03Z, started the app at 11:06:01Z (events 2 to 4 ran on this process).
- 2026-10-22 02:23Z, started the app at 02:27:25Z.
Events 2 to 4 happened 3h50m after the 11:06 start and about 11.5h before the next deploy.
Event 1 happened on a process that had been up since 2026-10-16 11:38, about 31 hours, with no
deploy near it (I rely on the process start time, because my deployment list does not reach back
to 10-17). So the "request mid-deploy hits a stale server-action id" explanation does not fit.

## Why (b) and not (a) or (c)

Against (a), our own stack answering text/plain to an RSC request:
- The only text/plain response in src is the /llms.txt route.
- The app has no server actions at all: no "use server", no serverActions or allowedOrigins config.
- The monitoring tunnel and the PostHog proxy return JSON or empty bodies, and the guard chain
  (route-guard) answers JSON. Only Next itself could answer an RSC request with a non-RSC type.

For (b):
- Browsers fetch RSC with GET plus a _rsc query. These are POSTs on pages and on a path the site
  does not have.
- Three requests within three seconds, no client tags, one hit tagged crawler.
- I suspect the React/Next RSC and server-action probes, but I could not check that without headers.

Against excluding (c):
- The message itself says "This is a bug in Next.js".
- I could not find the throw site. Grepping the installed next@16.3.8 dist for "Expected RSC
  response" found nothing; that search ran slowly on the OneDrive tree and may have skipped files
  that were not hydrated. The remote clone dirs I tried were gone. So I cannot say which Next code
  path throws it.

## Impact

Nothing user-facing is visible. Four events in five days, zero users, each one Sentry error from an
unauthenticated request.

## The three options (no change made)

1. Preferred: in src/instrumentation.ts (the two Sentry.init calls; onRequestError is
   Sentry.captureRequestError; no beforeSend or ignoreErrors exists today), add a beforeSend that
   drops events whose exception value starts with "Invariant: Expected RSC response" and whose
   transaction is a POST, with a test. GET and other invariants stay visible.
2. An inbound filter on the portfolio project in self-hosted Sentry matching the message. No code
   or deploy, but it is global and cannot be limited to POST.
3. Reject POSTs carrying a next-action header in src/proxy.ts with an early 404, since the app has
   no server actions. It changes request handling and needs its own review; not worth it for four
   events.

## Decision (from team-lead)

No code. PORTFOLIO-Q was set to ignored-until-escalating in Sentry with a comment. A POST-only
beforeSend filter is the fallback if it ever escalates.
