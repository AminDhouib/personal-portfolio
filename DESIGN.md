# Design

Why the code is shaped the way it is: boundaries, conventions actually enforced by the gates,
the register of things that look wrong but are intentional, and known debt. Read this before
"fixing" something that turns out to be deliberate — it exists so agents stop re-flagging the
same intentional choices across audit cycles.

See `RUNBOOK.md` for operations and `README.md` for the human quickstart.

## Boundaries and dependency direction

Routes call into `lib`; `lib` does not call back into routes or components. Direct filesystem
access is banned everywhere except a small, explicit allowlist (`FS_ALLOWLIST` in
`eslint.config.mjs`): `src/lib/blog.ts`, `src/app/apple-icon.tsx`, and `src/app/icon.tsx`. The
list shrank with the Postgres migration — the filesystem stores it once covered are gone.
Everything else that needs persistence goes through a store module — `fs`/`node:fs`/
`fs/promises` imports are lint errors outside that list.

Leaderboard, password-game, and leads persistence is Postgres (the compose `db` service),
reached **only** through the shared `pg` pool from `getPool()` (`src/lib/db.ts`). The games
leaderboard route, Password Game 2's leaderboard route, and `src/lib/leads-store.ts` read and
write tables created by `db/init.sql` (applied once on the db volume's first start); row shapes
are pinned by zod in `src/lib/persistence-schemas.ts`. Tests never touch a real database — each
store's suite does `vi.mock("@/lib/db")` and drives an in-memory fake pool, and persistence
changes need pinning tests FIRST (see `AGENTS.md`'s hard boundaries). See `RUNBOOK.md`'s Data
section for the operational side.

Games are self-contained under `src/components/game/`. Most games are a single top-level
component file (`hextris.tsx`, `tower-stacker.tsx`, `typing-speed.tsx`); non-component logic is
progressively being extracted into same-named subdirectories as each game gets touched —
`password-game-2/` (a full `engine/` with `rules/`, `events/`, and a seeded core, plus `stage/`
and `sound/` layers) and `super-voltorb-flip/` (`engine.ts`, `audio.ts`, `chrome.tsx`) are
furthest along; `space-shooter/` holds several
extracted modules (`spawning.ts`, `boss-behaviors.ts`, `sound-manager.ts`, `run-init.ts`) but
`space-shooter.tsx` and `hextris.tsx` still carry the bulk of their engine logic inline in the
component. See Extract-before-edit doctrine below before touching either.

`src/env.ts` is the sole `process.env` gateway for everything except four narrow, allowlisted
exceptions (`next.config.ts`, `src/instrumentation.ts`, `src/instrumentation-client.ts`, and
`src/components/game/space-shooter.tsx` for `NODE_ENV`-gated dev-only affordances — an FPS
overlay and a boss-cycle hotkey, not a schema-covered integration var). Everywhere else,
`no-restricted-properties` bans reading `process.env` directly.

## Conventions in force

Each convention below is backed by a gate that fails the build if violated — these are not
style suggestions.

- **Request guard chain** (`local/require-schema-parse-in-routes` + manual composition): mutating
  API routes call `guardRequest` or `guardedJsonRoute` (`src/lib/route-guard.ts`) before doing any
  work, in strict precedence order — 403 (cross-origin) → 429 (rate limit) → 413 (body over the
  16 KiB default cap) → 400 (invalid JSON). Handlers receive an already-parsed-but-still-`unknown`
  body and must run their own zod schema over it.
- **Upstream calls carry a deadline**: outbound `fetch` calls use `createDeadlineFetch`
  (`src/lib/upstream-fetch.ts`), enforced by the `local/fetch-requires-signal` rule. The deadline
  `AbortSignal` is created once per handler invocation and merged (via `AbortSignal.any`) with any
  caller-supplied signal — including, on the LLM route, the inbound request's own signal, so a
  visitor closing the chat aborts the upstream call immediately instead of waiting out the
  deadline.
- **`JSON.parse` only inside the safe-json wrappers**: `no-restricted-syntax` bans a bare
  `JSON.parse` call anywhere else. Client code uses `safeJsonParse` (`src/lib/safe-json.ts`),
  which reports a parse failure via the browser's native `reportError()` global. Server code must
  use `safeJsonParseServer` (`src/lib/safe-json-server.ts`), which reports through
  `captureException` instead — `reportError` reaches nothing on the server, and this split is
  enforced structurally: `safe-json-server.ts` imports `@/lib/log`, which pulls in `posthog-node`
  and fails any client bundle at build time if misused.
- **Every `catch` reports or is explicitly silenced**: `local/no-silent-catch` requires a real
  reporter call (`captureException`/`reportError`/equivalent) inside every catch block, or a
  `// silent-ok: <reason>` comment explaining why swallowing it is correct (e.g. best-effort
  temp-file cleanup where the original error is already being rethrown).
- **Client game code** uses two small helpers instead of ad hoc error/storage handling:
  `gameCrashToReport` (`src/lib/report-game-error.ts`) for RAF-loop catches — it dedupes to
  once-per-game-per-session and returns an `Error` the caller passes to a literal `reportError(...)`
  call (so `no-silent-catch` sees a real reporter at the call site); `safeLocalSet`/`asNumberArray`
  (`src/lib/safe-storage.ts`) for `localStorage` reads/writes that must never throw or trust an
  unchecked cast.
- **Adding a game** touches three places: `src/app/games/games-meta.ts` (the `GameSlug` union and
  metadata), the switch in `game-loader.tsx`, and the `BANNERS` record in `banners.tsx`. The
  `game-loader.tsx` switch's default case calls `assertNever(slug, ...)` (`src/lib/assert-never.ts`)
  — because the parameter type is `never`, forgetting to wire up a new slug there is a **compile
  error** (`tsc`/`next build`), not a silent blank page.
- **Coverage ratchet**: floors in `vitest.config.ts` (lines 34 / statements 33 / functions 35 /
  branches 29 as of 3abe0b0; re-based to 18/17/16/12 at pass-2, raised twice since) are
  measured margins below the current suite over the
  HONEST scope — coverage `include` is all of `src/`, so untested files count in the
  denominator. Floors may only be **raised**, in a dedicated commit, when measured coverage
  rises — never lowered except with a stated reason in that commit's message (the pass-2 drop
  from 67/63/61/54 was the denominator becoming honest, documented in that commit).
- **Lighthouse gate over every public page** (CI-only — needs a built, booted server, so it is
  not part of the local sweep): the `lighthouse` CI job boots the standalone bundle and runs
  `node scripts/run-lighthouse.mjs`, which derives the URL list from the server's own
  `/sitemap.xml` (plus `EXTRA_PATHS` for public routes deliberately kept out of the sitemap,
  currently `/ai`) — a new public page enters the audit the moment it enters the sitemap.
  Score floors live in `scripts/lighthouserc.json`: SEO and accessibility are **error**-level
  and ratchet like coverage (raise when measured scores rise, never lower to make CI pass);
  performance and best-practices stay **warn**-only because CI runner timing is too noisy for a
  hard floor. The deploy job requires this gate.
- **Gate-disable conventions**: the only sanctioned escape hatch is
  `// eslint-disable-next-line <rule> -- <reason>`. File-level or blanket disables, downgrading a
  rule to `"warn"`, and quietly widening `FS_ALLOWLIST` are all banned outright — fix the code, not
  the rule. When `FS_ALLOWLIST` genuinely must grow, the health route's own entry is the model: a
  comment explaining exactly what the direct fs access does and why a store module doesn't apply.

## Intentional-design register

Things that look like bugs or oversights but are deliberate. Each was verified against the
current tree on 2026-07-07.

- **`src/env.ts` splits format-checking (import time) from presence-checking (boot time).** The
  zod schema makes every key `.optional()` and validates FORMAT only — a malformed value (e.g. a
  non-URL `SENTRY_DSN`) throws, an absent one does not — because the module also loads during
  `next build`, where secrets are legitimately absent (CI, fork PRs). PRESENCE is enforced
  separately at server boot by `validateRequiredEnv()`, wired into `src/instrumentation.ts`'s
  `register()` and gated on `NEXT_PHASE` so it never runs during build: a missing
  `REQUIRED_ENV_VAR` fails the boot loudly (see the matching entry below). The per-integration
  graceful-degradation paths `.env.example` documents are defense-in-depth for a var revoked at
  runtime, not the prod contract — the boot gate guarantees prod never starts with one missing.
- **`env`'s reads go through a `Proxy`**, not the parsed zod output — the parsed result is
  discarded on purpose. A client component reading `env.NEXT_PUBLIC_FOO` will get `undefined` at
  runtime even though the proxy itself is fine: Next.js only inlines client-side env reads for
  _static_ `process.env.NEXT_PUBLIC_*` member expressions, never a dynamic `process.env[prop]`
  lookup. Client code needs the literal static read, or a committed constant — see
  `instrumentation-client.ts`'s `SENTRY_DSN` constant for the pattern (a DSN is a public
  identifier, not a secret, so committing it is correct, not an oversight).
- **`src/lib/github.ts` keeps a token-free fallback even though `GITHUB_TOKEN` is now required.**
  A classic read-only PAT (`read:user` scope) was provisioned in prod on 2026-07-14, so
  `GITHUB_TOKEN` is a `REQUIRED_ENV_VAR` and the boot gate enforces its presence; prod normally
  uses the authenticated GraphQL contribution calendar and authenticated repo stats. The
  unauthenticated fallback (repo stars/forks via unauthenticated REST; the graph via the
  token-free `github-contributions-api.jogruber.de` mirror) is not dead code — it is
  defense-in-depth so a token revoked at runtime degrades the page to real mirror data instead of
  breaking it.
- **The `schemaVersion` archive-then-reset machinery is historical (pre-Postgres).** Until the
  2026-07 migration, persisted JSON files carried a version envelope; a mismatch archived the
  file to `<name>.schema-mismatch-N`, corrupt JSON quarantined to `<name>.corrupt-N`, and the
  pre-v2 merged hextris/space-shooter history lives on in an archived v1 file. That filesystem
  store (`json-file-store.ts`) left with the migration — row shapes are now pinned by zod in
  `persistence-schemas.ts` against Postgres rows. This note stays only so readers of older
  commits and audit reports can map those references; like the `DATA_DIR` note below, it
  describes something that no longer exists.
- **`DATA_DIR` was removed (2026-07-23) with the Postgres migration.** It was once the optional
  root for on-disk JSON/JSONL persistence (default `<cwd>/.data`, prod mounted the `portfolio-data`
  volume there). Filesystem persistence is gone — leads and leaderboards now write Postgres via
  `src/lib/db.ts` — so the variable has no consumer and was deleted from the env schema and
  `.env.example`. This note exists only so readers of older commits that reference `DATA_DIR`
  understand where it went; there is no longer any "optional because it has a default" exception
  in `REQUIRED_ENV_VARS`.
- **Reduced-motion is inverted between chrome and games, on purpose.** The root layout
  (`src/app/providers.tsx`) wraps the whole app in `<MotionConfig reducedMotion="user">`, honoring
  the OS preference for page chrome. Every game explicitly opts back OUT: `game-loader.tsx` and
  `components/sections/game.tsx` both wrap their game content in a nested
  `<MotionConfig reducedMotion="never">`, and game keyframe animations plus the `animate-spin`
  status spinners are deliberately left ungated by either mechanism. Motion is gameplay in a
  game, not decoration — do not "fix" this into obeying the OS preference.
- **The `/games` grid shows 5 cards, not 6, on purpose.** `games-meta.ts` marks `tower-stacker`
  `hidden: true`, taking it out of rotation without deleting any code — the route still works if
  visited directly. `password-game` (The Password Game 2) is `external: true`: its card is live in
  the grid, but it links to its own top-level route (`/games/password-game`) outside the shared
  game-loader rather than to a `[slug]` page.
- **Tower Stacker's game is a vendored minified bundle — do not patch it in place.**
  `public/tower_stacker/dist/main.js` is the built output of upstream `iamkun/tower_game` (MIT,
  license alongside). Known quirks live inside that bundle and are accepted while the game stays
  hidden: the tower can drift far enough sideways that no drop can land (the run then bleeds out
  on lives), and PERFECT is awarded leniently. Fixing either means re-vendoring from patched
  source, not editing the dist. The parent React overlay owns the leaderboard form; an empty
  name deliberately falls back to "Stacker".
- **Super Voltorb Flip and PG2 render light-styled in both site themes, deliberately.** Their
  chrome is period/genre styling, not the site palette — do not wire them to the theme toggle.
- **The shared leaderboard row is reused loosely across games, by design.** Hextris stores
  blocks-cleared in the `kills` column and writes a `level` the UI never surfaces; player-name
  inputs cap at 12 characters (`maxLength` plus a slice in the handler). Only worth revisiting
  if the raw columns are ever exposed publicly.
- **`maxDuration` is deliberately absent from the LLM route** (`src/app/api/copilotkit/route.ts`).
  It's a Vercel-only directive and a documented no-op on this self-hosted deployment — the
  code's own comment calls it out as the same class of theater `env.ts`'s honesty pass removed
  elsewhere. The real control is an in-handler 60-second deadline via `createDeadlineFetch`,
  merged with the inbound request's own abort signal.
- **The voltorb win-re-entry quirk is characterized, not fixed** (audit ref NF(P7)-a): once a
  player exceeds the per-level max score, every further single-tile flip re-enters the win-state
  block. This is pinned by tests as documented current behavior, not silently accepted — treat a
  test change here as a deliberate behavior change, not a bug fix in passing.
- **Chess-puzzle's inner replay-consistency guards are intentionally silent** — they re-validate
  state that upstream callers have already validated once; a second failure there indicates the
  first guard's own invariant broke, which is a bug in the guard itself, not user input worth
  reporting again.
- **The `scripts/*.py` sprite-processing scripts are exempt from the TS toolchain by
  construction** — `slice-voltorb-chrome.py`, `strip-sprite-bg.py`, `tint-chrome-per-theme.py`,
  and siblings are one-off asset-prep tools run manually against the voltorb chrome sprites, never
  imported by the app, and outside eslint/typescript/vitest's file globs entirely.
- **`GuardedJson`'s `body: unknown` is a sanctioned narrow-me type, kept deliberately
  unexported** (`src/lib/route-guard.ts`). Every caller re-validates it with its own zod schema —
  this is the documented "accept `unknown` and narrow it" exception in
  `local/no-unknown-in-public-api`, not a gap the rule missed.
- **A malformed JSON body reaching `guardedJsonRoute` triggers `captureException`, not a silent 400.** This is accepted, not a noise source: routes are already rate-limited, and JSON produced
  by the app's own real clients (`JSON.stringify` output) cannot be malformed — a parse failure
  past the guard chain is inherently a signal of something abnormal, worth capturing.

The following Password Game 2 entries were verified against the current tree on 2026-07-22.

- **PG2's image CAPTCHA rejects the first correct submission on purpose** (`stage/widgets/captcha.tsx`).
  A player who selects exactly the right tiles on grid 1 and hits Verify is told "Verification
  failed. Please try again." and handed a second, fresh grid; only the correct set on grid 2 yields
  the token. This is the dark-pattern joke — the form doubts your humanity exactly once — not an
  off-by-one. The state machine structurally guarantees a single forced rejection: a wrong set is
  also rejected but never advances the stage, so it cannot consume the one scripted rejection, and
  grid 2 has no rejection branch, so the widget cannot soft-lock. The tile answers living in
  `aria-label` ("Storefront" and friends) are required for screen-reader play, not a leak to
  fix — the widget is a captcha parody, not a security control.
- **PG2's consent wall fights back when you switch a toggle off, by design** (`stage/widgets/consent.tsx`,
  `applyConsentMove` in `engine/rules/act1.ts`). Turning a switch OFF flips its seeded neighbor —
  declining one thing brings back something you already declined. That is the intended friction, not
  a state bug; the "Reset to initial" link is the honest escape when a player wedges the panel, and
  it disappears once solved. Because the widget holds its own progress, re-mounting the card (any HUD
  remount) resets it to the seed's `initial` — expected, since the passphrase reveal is idempotent.
  A player who deliberately re-solves after the rule is already green can append the passphrase a
  second time; the extra copy is accepted (the rule is a substring `includes`, and the length budget
  has headroom). The neighbor effect is a two-way FLIP rather than the spec's set-ON — see the plan's
  Task 11 amendment for why (a set-ON goal is a Garden-of-Eden state, unsolvable). Corollary,
  QA-misfiled as a blocker once already (2026-07-31): clicking only switch-OFF moves can cycle
  forever between two states and LOOKS unwinnable — the coupling fires only on switching OFF, so
  the intended escape is turning a coupled partner ON (an ON click flips just itself) and then
  OFF, which clears the pair together. The BFS net in `rules.test.ts` proves all-off reachable
  for every seed it checks; do not re-file this.
- **PG2's color-match widget is effectively sighted-only, and its near-twin exclusion is narrow on
  purpose** (`engine/rules/act2.ts`). Naming a swatch by hue is genre-inherent — the original Password
  Game's color rule is the same — so the widget is not made non-visually solvable; the offline solver
  and the payload's color name keep it deterministic for tests and racing. The `COLOR_CONFUSABLE`
  exclusion only keeps a perceptual near-twin (amber/gold, coral/salmon) out of the decoy pool when
  it is the TRUTH's twin; two decoys that happen to be twins of each other can still co-occur and are
  harmless, because the fair-match guarantee is only about distinguishing the truth from its decoys.
- **PG2's chess widget opens a 4-piece chooser on a promotion, not an auto-queen**
  (`stage/widgets/chess.tsx`). Clicking a promotion target sets `pendingPromotion` and renders the
  queen/rook/bishop/knight glyphs for the side to move; picking one types that SAN (so
  underpromotion dailies like `e8=N#` are now clickable), and clicking any board square while the
  chooser is open dismisses it as a plain deselect (no shake, no text). Non-promotion targets still
  type immediately. The chooser exists because SAN validate is a plain string check — a hardcoded
  queen could never satisfy an underpromotion best-move rule.
- **Every PG2 widget routes its text through `applyText` -> `applyKey`, the same path as a keystroke**
  (`engine/engine.ts`). This is the widget fairness invariant: a widget never writes to the password
  directly, so an active event that intercepts typing — a loading-bar stun swallowing keys, the snake
  eating a character, autocorrect rewriting — intercepts widget output identically. A widget can never
  bypass an in-progress event; the CAPTCHA token, consent passphrase, chess SAN, and color hex are all
  subject to the same event pressure a typed answer would face.
- **PG2's late game is attrition, on purpose.** Act 2+ events remove, rewrite, and inject
  password characters — autocorrect's seeded substitutions (`engine/events/autocorrect.ts`,
  e.g. "password" -> "passward" plus a lowercasing pass), the tractor's "letters rain back",
  stray symbol injection, the invader shooter — so previously satisfied rules re-open, including
  a captcha re-verification. Rules always evaluate against the mutated text. A scripted solver
  that only repairs text will lose ground here; that is the design, not a regression.
- **PG2's chess widget accepts and plays a WRONG move** — the SAN is written to the password and
  the board keeps the position for retry; the rule simply stays unsatisfied. Rejection-on-entry
  would leak which move is best. The best-move/accept list shipping to the client is inherent to
  client-side validation and registered as such, not a leak to fix.

## Adversarial standoffs (restated from the audit's final report)

These went through two rounds of adversarial review and were not fully resolved either way —
recorded here so a future pass doesn't re-litigate them from scratch.

- **Persistence backup/restore was the audit's one standoff that survived intact.** The
  characterization tests, atomic writes, and corruption quarantine added since (P1) close the
  "untested" half of the original finding, but whether a _working_ backup/restore procedure
  exists for prod is still unverifiable from the repo alone — because none exists yet. See Known
  debt below; this is the audit's top operational risk.
- **Hextris's original engine split is disputed as "move-only."** An earlier refactor commit
  split sound handling, types, and two math helpers out of `hextris.tsx` into `hextris/`, but the
  bulk of the grid/collision/match-3 logic stayed inline. Whether that commit counts as
  meaningful progress on RC-3 or mostly relocated code without reducing the monolith is an open
  disagreement — treat `hextris.tsx` as still-inline for planning purposes regardless.
- **The absence of an HTML contact form is intentional, not a gap.** Lead capture happens through
  the AI chat widget's "talk to a human" flow plus a "Book a Call" link, not a traditional form.
  This was reframed during review as deliberate product personality for an AI consultancy,
  implemented consistently across the site — don't "fix" it into a form.

## Extract-before-edit doctrine

Any future gameplay change to `hextris.tsx` or `space-shooter.tsx` starts by extracting the
touched subsystem into its own tested module first, following the pattern `super-voltorb-flip/`
and `password-game-2/` already establish (a plain, seedable, unit-testable engine module; the
component file left as the render/glue layer). Do not add logic to either monolith in place —
that is exactly the change-cost pattern the audit measured directly (a site-wide reduce-motion
change touched 32 files; adding a game touches 3 dispatch points by design, but editing an
already-inline engine has no such bound).

## Change guide

**Copy or content change** (blog post, page text, game description/tagline): edit the relevant
MDX file under `content/blog/` or the metadata in `games-meta.ts` / page component directly. No
gate beyond the standard sweep applies specifically to content changes.

**Gameplay change** (a game's rules, scoring, or engine behavior): follow the extract-before-edit
doctrine above first if the target game doesn't already have an extracted engine module. Add or
update the game's own unit tests for the touched logic before changing behavior — the point of
extraction is making this possible.

**New API route**: compose it from `guardRequest`/`guardedJsonRoute` (`src/lib/route-guard.ts`)
for the origin/rate-limit/body-parse prelude, define a zod schema for the body, and add route
tests using the temp-dir persistence harness introduced in P1 if the route touches `.data`. If the
route needs an enum/slug of its own (a new game, a new rule tier), register it wherever the
existing enums for that category live rather than inventing a parallel one.

## Known debt

Every deferral below was a deliberate scope decision, not an oversight. Each lists what would
trigger revisiting it.

- **CopilotKit run failures never reach Sentry** — CLOSED 2026-07-31. The runtime emitted
  chat-run errors as `RUN_ERROR` events inside the SSE stream (plus the browser console) and
  swallowed them server-side, so the multi-day dead-chat outage fixed by the per-request
  `CopilotRuntime` produced zero Sentry events. `src/lib/copilot-run-error-tap.ts` now tees the
  response body and forwards any `RUN_ERROR` frame to `captureException`, returning the client
  branch untouched. It reads the stream rather than using a library hook because 1.54.1 has none
  that works: `CopilotRuntime`'s `onError` is declared but never read on this path (and its own
  docs call it a paid Cloud feature), the `observability_c` call sites are commented-out TODOs,
  and `createCopilotEndpointSingleRoute` accepts only `{ runtime, basePath, cors }`. Recheck
  those three on a major CopilotKit upgrade — a real hook would be less fragile than reading
  frames off the wire.
- **RC-3 — full engine extraction for `space-shooter.tsx`/`hextris.tsx`** (High severity, large
  effort). Deferred; the extract-before-edit doctrine covers incremental progress. Trigger: any
  gameplay-affecting edit to either file.
- **RC-6 — a user-facing motion/settings toggle** (Medium). The current fix is OS-preference-only
  (chrome honors `prefers-reduced-motion`, games opt out). A user-facing in-app toggle, and a
  shared settings provider to host it, remain undone.
- **RC-7 — single game registry consolidation** (Medium). Today there are three independently
  maintained game-dispatch points (`games-meta.ts`, the `game-loader.tsx` switch, `banners.tsx`'s
  `BANNERS` record); `assertNever` makes the switch fail-closed but doesn't unify them. Trigger:
  the next new game (#7) — speculative consolidation before then isn't worth the churn.
- **RC-12 — a CI step that builds the Dockerfile itself** — rejected outright, not deferred. CI
  already runs `next build`; building the Docker image too was judged low value for the added
  CI time.
- **Backup schedule + a practiced restore drill** (owner-deferred; the register's top operational
  risk). `RUNBOOK.md` documents today's manual copy-out/copy-back procedure; no automated,
  scheduled backup exists. Also carries: prod's leaderboard is near-empty for reasons predating
  the current persistence hardening, not a symptom of a live bug.
- **Deploy authority** (owner-accepted limitation). The CI `deploy` job needs
  `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`, `DOKPLOY_URL`, and `DOKPLOY_TOKEN` as repository
  secrets to do anything; all four are unset today by explicit choice, so CI's deploy job always
  self-skips green and manual deploy (`RUNBOOK.md`) is the standing procedure. Revival = setting
  those four secrets.
- **The schema-parse eslint rule is structurally blind past its current 3-route set**
  (`local/require-schema-parse-in-routes`, audit ref NF-P3-f). It verifies a route calls some zod
  schema, not that the schema matches the route's actual data shape, and only fires per-file — a
  cross-file version that could catch a schema/handler mismatch was scoped as large-effort for
  near-zero marginal value while the guarded set stays closed and line-by-line reviewed. Accepted
  residual risk, not a gap to close reflexively.
- **r3f (React Three Fiber) crash recovery UX** (audit ref NF-P5-a): a WebGL context loss or
  three.js render error in a 3D game currently has no dedicated recovery path beyond the generic
  error boundary. Undone.
- **A dedicated `localStorage`-usage lint rule** (audit ref NF-P5-b): `safeLocalSet`/
  `asNumberArray` are convention, not yet gate-enforced — nothing currently fails the build if a
  new game bypasses them with a raw `localStorage` call.
- **Voltorb's tile-fade animation still uses a raw `requestAnimationFrame` loop** (audit ref
  NF-P6-1) rather than the shared engine/effects pattern the rest of that game now follows.
- **PG2's four rule-card widgets nest interactive controls inside a native `<button>`** (`stage/widgets/`
  captcha/chess/color/consent). `RuleCard` renders the whole card — description, live message, and the
  `PayloadView` widget — as one native `<button>` (the click-to-expand affordance), so each widget must
  render its own controls as `role="button"`/`role="switch"` divs with `tabIndex` and key handlers
  rather than real nested buttons (nested interactive elements are invalid DOM). This is a shared
  accessibility smell — a real screen-reader user gets a button-inside-button tree — but it is
  functionally harmless (every widget control `stopPropagation`s so it does not toggle the card) and
  cheap only to fix by restructuring `RuleCard` so the expand affordance is not the outer element.
  Deferred; trigger is any broader `RuleCard` a11y pass. Additionally, the consent widget's "Save
  preferences" control keeps `tabIndex=0` while disabled and signals its state via `aria-disabled`
  (rather than dropping out of the tab order) — ARIA-legal, flagged here for awareness.
- **Some defensive branches are provably dead** (audit ref NF(P7)-b) — error paths guarding
  conditions that current callers can no longer produce, left in place as cheap insurance rather
  than removed.
- **Coverage thresholds are repo-wide, not per-file** (audit refs NF(P7)-d, P2-TEST-003) — a
  single well-tested module can currently offset an untested one; the ratchet only guards the
  aggregate. (The companion scope debt NF(P7)-c is resolved: pass-2 set coverage `include` to all
  of `src/`, so untested files now count in the denominator instead of being invisible.)
- **`tower-stacker.tsx` and `typing-speed.tsx` have zero tests** (audit ref P2-TEST-004,
  deferred) — both are single-file games whose pure math (block overlap/trim, WPM/accuracy)
  would extract cheaply under the extract-before-edit doctrine. Trigger: any gameplay edit to
  either file.
- **No browser-level smoke test runs in CI** (audit ref P2-TEST-005, deferred) — route tests
  exercise handlers in-process; nothing in CI loads a real page in a browser. The scoped design
  if revisited: a Playwright job hitting `/`, one game page, and `/api/health` against
  `next start`. Deferred for CI-time cost, revisit if a shipped page-level breakage escapes the
  current gates.
- **A `LeadRecord` admin-reading surface doesn't exist yet** (audit refs NF-P1-c, P2-DATA-005;
  owner ruling 2026-07-07: document only, do not build yet). The read primitive now exists —
  `readAllLeads()` in `src/lib/leads-store.ts` (lenient per-line, used by the restore drill) —
  but there is no in-app way to view leads. The documented design when it is built: a
  `GET /api/leads` handler gated by an `ADMIN_TOKEN` bearer check, returning `readAllLeads()`
  output; no UI page. Until then the owner reads the Resend email or the JSONL file directly.
- **Space-shooter-private settings/profile modules** (audit refs CT-009, CT-010, DD4-002, from the
  P5/P8 plan notes): the reduce-motion change-trace measurement (32 files touched) surfaced that
  cross-cutting client concerns — including space-shooter's own settings/profile state — have no
  shared home outside that one game. Related to, but not resolved by, RC-6 above.
- **Two prod env vars are dead**: `NEXT_PUBLIC_GA4_ID` and `NEXT_PUBLIC_CALENDLY_URL` have zero
  reads anywhere in `src/` and no entry in `env.ts`'s schema (verified 2026-07-07). Housekeeping:
  remove them from the Dokploy application's environment whenever convenient; nothing depends on
  either.
- **The `typescript-eslint` `no-unsafe-*` rule set is deferred** — not yet adopted; the plan is to
  measure the noise/signal cost on this codebase before turning any of them on.
- **Stale local branches and an old stash exist on the maintainer's machine**: `dev` and
  `feature/scaffold` branches, plus one stash (`feat(password-game): add RichInput with bold/
italic formatting`). User cleanup item, not blocking anything.
