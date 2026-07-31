# Runbook

Operations reference for this repo's production deployment. **Production procedures come
first** — written so a cold agent with prod down can reach "service restored" using only this
file. A labeled development-environment section follows, covering pitfalls specific to the
maintainer's Windows/OneDrive machine.

See `README.md` for the human quickstart and `DESIGN.md` for why the code is shaped the way it
is (boundaries, conventions, the intentional-design register).

## Production operations

### Health

`GET /api/health` (`src/app/api/health/route.ts`) always returns HTTP 200 with:

```json
{ "status": "ok", "uptime": 12345, "checks": { "db": "connected" } }
```

`checks.db` is a `SELECT 1` against Postgres (`getPool()`, `src/lib/db.ts`) — it catches an
unreachable or down `db` service, the silent failure mode that would otherwise lose leads and
leaderboard writes. **Read the JSON body, not just the HTTP status**: the HTTP status stays `200`
even when the db is down — the top-level `status` flips to `"degraded"` and `checks.db` to
`"unreachable"`, but the response code does not. This means a db outage will **not** fail the
container's Docker `HEALTHCHECK` (which only checks `response.ok`, i.e. the HTTP code) and will
**not** trigger a Swarm auto-restart — only a fully unresponsive process does that. If you suspect
a db problem, curl the endpoint and read `checks.db` yourself:

```bash
curl -s https://amindhou.com/api/health
```

The image's `HEALTHCHECK` (`Dockerfile`) probes the same endpoint from inside the container:
`--interval=30s --timeout=5s --start-period=20s --retries=3`, hitting
`http://127.0.0.1:3000/api/health`. Container-level health status
(`docker inspect --format='{{.State.Health.Status}}' <container>`) requires direct server/docker
access — it is not exposed through the Dokploy API surface available to agents.

### Logs

- **stdout** → Dokploy container logs (panel, or the `application-readLogs` API).
- **API log reads want the full container NAME**, not the short hex id — `compose-readLogs`
  with an id like `41c3cff6d697` returns a 500; pass the name
  (`compose-index-multi-byte-microchip-5usn3s-app-1`-style, from `docker-getContainers`).
- **Exceptions**: `captureException()` (`src/lib/log.ts`) always reports server-side to
  self-hosted Sentry, and additionally forwards a PostHog `$exception` event when both
  `POSTHOG_KEY` and `POSTHOG_HOST` are configured (silently skipped otherwise — there is no
  separate pageview/analytics client wired in; PostHog here is exception-forwarding only).
  Client-side game crashes go through a different path: `gameCrashToReport`
  (`src/lib/report-game-error.ts`) wraps the error and callers pass it to the browser's native
  `reportError()` DOM global — not a custom function — which the already-installed Sentry client
  SDK picks up via its own `window.onerror` listener.
- **Tunnel**: `sentry.devino.ca` isn't reachable from visitor networks (and ad blockers eat
  direct Sentry calls), so both client and server envelopes are relayed through `/monitoring`
  (`src/app/monitoring/route.ts`), which validates the envelope's DSN and forwards it to Sentry
  (org `devino`, project `portfolio`) with an 8s timeout.
- **Caution**: a hand-built curl envelope to `/monitoring` can get a `200` from the relay yet
  never materialize as a Sentry event — the relay only checks the DSN header and size, not
  envelope well-formedness. Real SDK-generated events do land (observed empirically). Don't
  debug ingestion with raw curl envelopes; trigger a real error path (client or server) instead.

### Deploy

**Push to `main` is not the same as deployed.** Dokploy's built-in GitHub `autoDeploy` webhook
cannot work here — the Dokploy panel is reachable only over Tailscale, and GitHub's servers
can't reach into the tailnet to deliver a webhook. `.github/workflows/ci.yml`'s `deploy` job
works around this by joining the tailnet itself (via `tailscale/github-action`, OAuth client
tagged `tag:ci`) and calling the Dokploy API from inside it — but only when four repository
secrets are all set: `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`, `DOKPLOY_URL`, `DOKPLOY_TOKEN`. If
any are missing, the job prints `deploy skipped: secrets not configured` and exits **green** —
CI passing does not mean the site shipped.

**Standing procedure — manual deploy:**

1. Trigger it: the Dokploy panel's "Deploy" button, or from a machine on the tailnet:
   ```bash
   curl -sf -X POST "$DOKPLOY_URL/api/application.deploy" \
     -H "x-api-key: $DOKPLOY_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"applicationId":"9ZeLiZVLfBtm0OwzIWBxI"}'
   ```
2. Verify: check the deployment list in Dokploy for your commit hash at the top with status
   `done` (build takes roughly 45s).
3. Live-probe: `https://amindhou.com` returns 200, `curl -s https://amindhou.com/api/health`
   reports `"status":"ok"`, and spot-check one API contract (e.g. a leaderboard GET).

Do not consider a change shipped until all three steps pass.

### Rollback

Verified procedure: `git revert` the bad commit(s), push to `main`, manually deploy the reverted
`HEAD` (steps above), then re-run the same three verify/live-probe steps. Dokploy's panel exposes
a rollback surface too, but only revert-and-redeploy has been exercised — treat the panel
rollback as unverified rather than documenting it as procedure.

### Restart / stop / start

Use the Dokploy panel's Start / Stop / Reload controls on the application, or the same API
pattern as deploy (`$DOKPLOY_URL/api/application.<action>` with the `x-api-key` header and the
`applicationId` above, where `<action>` is `stop`, `start`, or `reload`).

Prefer **reload** (restarts the existing container/image, no rebuild, fast) when the running
process is wedged but the last-deployed code is fine — e.g. after manually repairing data in the db.
Prefer **redeploy** (full rebuild from current `main`) any time the fix is a code or commit
change.

### Data

All persisted data lives in **Postgres**, not on disk. Compose defines a `db` service
(`postgres:17-alpine`) whose data sits on the `db-data` named volume; the schema is created once,
on the volume's first start, from `db/init.sql` mounted into `/docker-entrypoint-initdb.d/`.
Tables: `leaderboard_entries`, `pg_leaderboard_entries`, `pg2_leaderboard_entries`, and `leads`.
Row shapes mirror the zod schemas in `src/lib/persistence-schemas.ts`. There is no `.data`
directory and no JSON/JSONL file store anymore — the old file-persistence machinery (corruption
quarantine, schema-mismatch archive-then-reset, `validate:data`) was removed in the Postgres
migration.

**Inspect / repair** — needs docker access to the host (locally your own machine; in prod the
tailnet + docker CLI on the server):

```bash
docker compose exec db psql -U portfolio -d portfolio
```

A failed read or write surfaces as a Postgres error: the route catches it, `captureException`
reports it to Sentry (`src/lib/log.ts`), and the request returns an error status rather than
silently losing or corrupting data. There is no in-code migration — `db/init.sql` uses
`CREATE TABLE IF NOT EXISTS` and only runs on a first-ever start, so a schema change means editing
that file and applying the delta by hand against the live db.

**Backup — none scheduled (owner-deferred).** Dump the database manually:

```bash
docker compose exec db pg_dump -U portfolio portfolio > portfolio-$(date +%Y%m%d).sql
```

Restore into a running db service:

```bash
cat portfolio-<date>.sql | docker compose exec -T db psql -U portfolio -d portfolio
```

These mirror standard Postgres backup practice and are unverified against this deployment; restore
into a throwaway db and check it before trusting it. A fresh `db-data` volume starts with empty
tables, so an empty-looking board right after a volume reset is expected, not a symptom of a bug.

### Monitoring reality

**Exists**: Sentry (errors, both client and server), PostHog (server-side exception forwarding
only, when configured), Dokploy's deployment-state history, the container `HEALTHCHECK`
described above (drives Swarm auto-restart on a wedged/crashed process only).

**Does not exist**: any uptime pinger or external synthetic monitoring, and no alerting/paging of
any kind. Nobody is notified if the site goes down — you find out by checking, or a visitor tells
you.

**AI-chat run failures**: these now reach Sentry, as of 2026-07-31. CopilotKit reports them as
`RUN_ERROR` events inside the SSE stream while still answering HTTP 200, so nothing throws
server-side and the 2026-07 multi-day dead-chat outage produced zero Sentry events.
`src/lib/copilot-run-error-tap.ts` mirrors the response body and forwards those frames to
`captureException`, so they arrive tagged `copilotkit:run-error` under a `CopilotRunError` issue.

Note what this does and does not buy you: a broken chat now raises Sentry events, but there is
still no alerting (see above), so nobody is paged — you have to look. And a chat that fails
without emitting a `RUN_ERROR` frame at all would still be silent. When in doubt, verify the way
the outage was originally caught: actually ask it something more than 60 seconds after the page's
first copilotkit POST.

## Development environment (maintainer's Windows/OneDrive machine)

The following are pitfalls specific to this machine's setup (Windows 11, OneDrive-synced working
copy). They are not universal behavior.

### The dev loop is Docker Compose

`pnpm dev` is `docker compose up --build` (see AGENTS.md): it builds the app image and starts it
alongside the `db` Postgres service, waiting for the db healthcheck. The container runs the
**production** build (`NODE_ENV=production`, `next build` then start — no Turbopack, no hot
reload), so a code change means re-running `docker compose up --build`; because the image is
rebuilt fresh each time, there is no stale-module-graph replay across restarts the way `next dev`
had.

- No host port is published by default (see the comment in `compose.yml`). For a browser, add a
  local-only override — `docker compose up` with an `-f` overlay that adds `ports: ["3000:3000"]`
  to the app service — or reach it via `docker compose exec`.
- Run it detached with `docker compose up -d --build` (`pnpm start` is the `-d` form) and follow
  logs via `docker compose logs -f app`; stop with `docker compose down`. Backgrounding a
  foreground `docker compose up` inside an agent session still risks the session-churn death that
  killed backgrounded `next dev` jobs — prefer `-d` (a real daemon) over a session-backgrounded
  process.
- Needs a local `.env`: at minimum `POSTGRES_PASSWORD`, plus every REQUIRED var — the boot gate
  (`src/env.ts` `validateRequiredEnv`) refuses to start without them, in dev too. See
  `.env.example`.

### The bare `next dev` escape hatch (and its stale-module-graph trap)

Running Next.js outside compose — `pnpm exec next dev` against a local Postgres, with
`DATABASE_URL` and the required vars set in your environment (`.env.example` documents this) — is
a sanctioned fast-iteration path but is not wired to an npm script. Its Turbopack pitfalls, which
do NOT apply to the compose loop above, are:

Turbopack's dev chunk URLs are path-derived and stable across content changes, so browser memory
and disk cache can replay an entire stale module graph across dev-server restarts. Orphaned
`next dev` processes make it worse: if port 3001 is taken, the next server silently binds 3003 —
and killing whatever's listening on 3001 can let an _older_ orphaned process re-claim it instead
of your new one.

Recipe:

1. Kill every node process listening on ports 3001–3005.
2. Confirm `.next` is fully gone before restarting — OneDrive file locks can make a single
   `Remove-Item`/`rm -rf` silently partial, so retry in a loop and verify with a directory-existence
   check afterward, not just a non-erroring delete command.
3. Start exactly one dev server, detached (e.g. PowerShell `Start-Process`), not as a foreground
   or backgrounded-in-session process — a session churn can orphan a backgrounded one.
4. Fingerprint the server you started: note the listener PID's start time and/or the `uptime`
   field from `/api/health`.
5. Use a fresh browser instance (`--disk-cache-size=1`) whose _first_ navigation hits that
   specific server, so there is no stale cache to replay.

### Build/test interactions

Run tests **before** building, not after — and if a build already happened, run
`rm -rf .next` (with the retry-loop from above) before running tests. `pnpm build`'s standalone
output traces stray test files into `.next/standalone`, which vitest will double-count if `.next`
is on disk when it runs (see `vitest.config.ts`'s `test.exclude`, which now guards against this —
still avoid building and testing out of order). Never run `pnpm build` while a dev server is
running against the same `.next` directory.

### vitest 4.1.4 quirks

- `vi.hoisted` is unusable here: the transform hoists the callback above the imports it needs.
  Use plain top-level setup plus a dynamic `await import(...)` instead.
- Constructor mocks need `vi.fn(function () { ... })`, not an arrow function — arrows have no
  `[[Construct]]`, and the resulting failure is silent inside a `try`/`catch`.
- Call `vi.unstubAllGlobals()` before other cleanup in `afterEach`.
- Spy on `Storage.prototype.setItem`, not `window.localStorage` directly.
- `AbortSignal.timeout` is not driven by fake timers — use short real timeouts in tests that
  exercise it.

### Raw control-byte trap

Authoring `\x1b`-style escape sequences through agent tool calls can write literal raw control
bytes into a file instead of the intended escaped text — these bytes are invisible to normal
reading but blind `grep`/`ripgrep` on that region. Prefer `String.fromCharCode(...)` when a file
needs to contain a real control character, and byte-scan any touched file afterward (assert no
bytes below `0x20` other than `\n`, `\t`, `\r`) before trusting it's clean.

### CSS reduced-motion cascade rule

`src/app/globals.css`'s `@media (prefers-reduced-motion: reduce)` block is deliberately the very
last thing in the file. It shares specificity with the base rules it overrides (`.pulse-dot`,
`.animate-marquee`, `html { scroll-behavior }`), so at equal specificity the cascade — source
order — is what decides, not the media query. Moving this block earlier in the file would
silently stop it from winning. To emulate the preference in a browser for testing, use the
`--force-prefers-reduced-motion` flag rather than OS-level settings.

### Browser automation against this site (QA-agent gotchas, learned 2026-07)

- **Windows occlusion freezes rAF**: automated Chrome opened occluded on this machine stops
  delivering `requestAnimationFrame`, which reads as a frozen game. Launch with
  `--disable-features=CalculateNativeWinOcclusion`, use `localhost` (not `127.0.0.1`), and
  assert `document.visibilityState === "visible"` before calling anything a freeze.
- **Headless-Chrome frame ceiling is ~31 fps** on this machine (measured on an idle page).
  Every canvas game reads ~31 fps under automation — that is the compositor cadence, not a
  game throttle; only 500ms+ gaps or identical consecutive canvas readbacks indicate a stall.
- **Playwright MCP writes only under the repo root** (`.playwright-mcp/`, gitignored). Keep
  `.mjs` scratch scripts OUT of it — oxlint lints the directory and a stray script turns the
  commit gate red on an otherwise clean tree.
- **PG2**: the password surface is a custom div over a hidden `aria-hidden` input — `fill()`
  appends and does not drive the game; focus the proxy input directly
  (`document.querySelector('input[aria-hidden="true"]').focus()`) and use keyboard input.
  `keyboard.type` silently drops non-ASCII (it ate the accent in "Réunion") — use
  `keyboard.insertText`. Event controls (FEED / BASKET / STOKE chips, crisis meters) are
  CANVAS-painted with internal hit-rects (`stage/painters.ts`) — they never exist in the DOM;
  click the stage canvas at the chip's visual position (top-right column over the password box,
  38px row stride). The stage canvas also overlays the password box, so a click aimed at the
  text lands on the canvas.
- **Tower Stacker is not a React game**: a static build in an iframe
  (`/tower_stacker/game.html`) — start/drop live inside the frame; the game-over overlay and
  leaderboard form are parent-page React.
- **Hextris starts from a canvas click** ("Click to start" — no DOM button), and empty-corner
  canvas readbacks can look frozen; sample the centre band.
