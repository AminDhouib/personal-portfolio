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
{ "status": "ok", "uptime": 12345, "checks": { "data": "writable" } }
```

`checks.data` is a non-mutating `W_OK` probe on the `.data` directory (the mounted volume in
prod) — it catches a missing or read-only mount, the silent failure mode that would otherwise
lose leads and leaderboard writes. **Read the JSON body, not just the HTTP status**: the top-level
`status` and the HTTP status code both stay `"ok"` / `200` even when `checks.data` reports
`"unwritable"`. This means an unwritable data mount will **not** fail the container's Docker
`HEALTHCHECK` and will **not** trigger a Swarm auto-restart — only a fully unresponsive process
does that. If you suspect a mount problem, curl the endpoint and read `checks.data` yourself:

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
- **Exceptions**: `captureException()` (`src/lib/log.ts`) always reports server-side to
  self-hosted Sentry, and additionally forwards a PostHog `$exception` event when both
  `POSTHOG_KEY` and `POSTHOG_HOST` are configured (silently skipped otherwise — there is no
  separate pageview/analytics client wired in; PostHog here is exception-forwarding only).
  Client-side game crashes go through a different path: `nextGameCrash`
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
process is wedged but the last-deployed code is fine — e.g. after manually repairing a data file.
Prefer **redeploy** (full rebuild from current `main`) any time the fix is a code or commit
change.

### Data surgery

`.data` is the named Docker volume `portfolio-data`, mounted at `/app/.data` in the container —
it holds **live** leaderboards and contact-form leads. Never edit it in place casually.

**Corruption path**: `readFileForUpdate()` (`src/lib/json-file-store.ts`) is the strict read used
ahead of any write. If the on-disk file is unreadable, malformed JSON, or the wrong shape for its
declared `schemaVersion`, it is renamed to `<file>.corrupt-<n>` as a best-effort quarantine and
the read throws `JsonFileCorruptError` — the write aborts rather than overwriting real data with
a near-empty replacement, and the route returns 503. `readFile()` (used by GET requests) is
deliberately lenient and renders an empty board from the same bad file instead of 500ing the
public page, so a corruption only blocks writes, not reads.

**Schema reset (version mismatch) — automatic.** Every persisted JSON document carries a
`schemaVersion` (`src/lib/persistence-schemas.ts`); leads.jsonl carries it per line. When the
write path finds a file whose version does not match the build (including pre-versioning v1
files, which parse as version `undefined`), it does an **archive-then-reset**: the old file is
renamed to `<file>.schema-mismatch-<n>` (bytes preserved, mtime intact), a `captureException`
fires so the event is visible in Sentry, and a fresh empty document takes its place. Old data is
never migrated in code — that is the owner-approved break+reset policy (pass-2 audit,
2026-07-07). After deploying a schema bump: confirm the archives exist next to the fresh files,
run the validator (step 3 below) against the live dir, and delete the archives once you no longer
want the old data. To manually reset a file, take a volume backup (below) and simply delete the
file — the next write recreates it at the current version.

**Recovery**:

1. On the server, find the `<file>.corrupt-<n>` sibling next to the original inside the volume.
2. Inspect and repair its contents in a scratch copy — never the live file directly.
3. Validate the repaired copy before it goes anywhere near the volume:
   ```bash
   node scripts/validate-data-files.mjs <path-to-scratch-copy-dir>
   ```
   (`pnpm validate:data`, with no args, always points at the live `.data` — to check an arbitrary
   directory, such as a scratch copy or a restored backup, call the script directly as above.) A
   nonzero exit means a file was unreadable, malformed, carried the wrong `schemaVersion`, or
   contained invalid rows. Zero rows is valid (a freshly reset file is empty by design); a
   missing `leads.jsonl` in an environment that never received a lead is expected, not
   corruption.
4. Replace the live file with the validated copy and reload the app (see Restart above).

**Backup — today, manual only.** No scheduled backup exists (owner-deferred). To copy the volume
out:

```bash
docker run --rm -v portfolio-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/portfolio-data-$(date +%Y%m%d).tar.gz -C /data .
```

To restore:

```bash
docker run --rm -v portfolio-data:/data -v "$PWD":/backup alpine \
  tar xzf /backup/portfolio-data-<date>.tar.gz -C /data
```

then reload the app and re-run the validator against `.data` before trusting it. Both commands
require direct docker access to the host (tailnet + docker CLI on the server) — the builder of
this doc could not execute them from the dev environment and verified them against standard
Docker volume-backup practice only.

Context: prod's leaderboard is currently near-empty for historical reasons predating the current
persistence hardening — an empty-looking board by itself is not a symptom of a current bug.

### Monitoring reality

**Exists**: Sentry (errors, both client and server), PostHog (server-side exception forwarding
only, when configured), Dokploy's deployment-state history, the container `HEALTHCHECK`
described above (drives Swarm auto-restart on a wedged/crashed process only).

**Does not exist**: any uptime pinger or external synthetic monitoring, and no alerting/paging of
any kind. Nobody is notified if the site goes down — you find out by checking, or a visitor tells
you.

## Development environment (maintainer's Windows/OneDrive machine)

The following are pitfalls specific to this machine's setup (Windows 11, OneDrive-synced working
copy, Next.js 16.2.2 + Turbopack). They are not universal Next.js behavior.

### The stale-module-graph trap

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
