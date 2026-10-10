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
are pinned by zod in `src/lib/persistence-schemas.ts`. Unit tests never touch a real database —
each store's suite does `vi.mock("@/lib/db")` and drives an in-memory fake pool, and persistence
changes need pinning tests FIRST (see `AGENTS.md`'s hard boundaries). The one exception is the
CI-only arcade store test against a throwaway service container (see the register). See
`RUNBOOK.md`'s Data section for the operational side.

Games are self-contained under `src/components/game/`. Most games are a single top-level
component file (`hextris.tsx`, `tower-stacker.tsx`, `typing-speed.tsx`); non-component logic is
progressively being extracted into same-named subdirectories as each game gets touched —
`password-game-2/` (a full `engine/` with `rules/`, `events/`, and a seeded core, plus `stage/`
and `sound/` layers) and `super-voltorb-flip/` (`engine.ts`, `audio.ts` with `sound-cues.ts`,
`synth.ts` and `music.ts` behind it, `chrome.tsx`, `art/`) are
furthest along, and `hextris/` now holds a clean-room `engine/` and `render/` with `hextris.tsx`
left as the shell; `space-shooter/` holds several
extracted modules (`spawning.ts`, `boss-behaviors.ts`, `sound-manager.ts`, `run-init.ts`) but
`space-shooter.tsx` still carries the bulk of its engine logic inline in the component. See
Extract-before-edit doctrine below before touching it.

`tower-stacker/` is first-party and fully extracted: `engine.ts` (pure, seedable, with
`scoring.ts`, which the server imports) and `daily.ts` are DOM-free; `painter.ts` draws
through a structural `CanvasLike`; `stage.tsx` owns the DOM HUD, the phase machine and the
phone play sheet, with `use-tower-loop.ts`, `audio.ts`, `controls.ts` and `play-sheet.ts`
behind it. `tower-stacker.tsx` is a thin entry that forwards `?tower-seed=`. Its RNG helpers
come from `password-game-2/engine/rng` (the one cross-game import; the audio and control
helpers are copies, as games do not import each other's modules).

`script-knight/engine/` is a port of WarriorJS (MIT, Matias Olivera; bc68e87) as pure TypeScript:
no React, DOM, storage or clock, and no hidden randomness, so a run is fully determined by its
level and its action log (`codec.ts`, `"1:"` plus two characters per turn). `run.ts` steps it
(`beginTurn` / `endTurn`, or `step(action)` for replays, hand play and the server). Its `LICENSE`
ships beside it and every ported file names the upstream file it came from
(`__tests__/licence.test.ts` pins both). `__tests__/fixtures/upstream-runs.json` holds 252
upstream runs (36 bot runs and 216 seeded fuzz runs, bind, detonate and idle included) that
`upstream-parity.test.ts` replays, comparing result, per-turn events and warrior status, and the final
map; regenerate with the script named in that test's header. The server will re-simulate daily runs with
this same engine (planned for T7-5); player code never runs on the server and nothing server-side may import
`script-knight/sandbox/` (`src/__tests__/no-player-code-on-server.test.ts` is the guard).

`src/env.ts` is the sole `process.env` gateway for everything except five allowlisted files
(`next.config.ts`, `playwright.config.ts` for its `E2E_*` variables, `src/instrumentation.ts`,
`src/instrumentation-client.ts`, and `src/components/game/space-shooter.tsx` for `NODE_ENV`-gated
dev-only affordances: an FPS overlay and a boss-cycle hotkey, not a schema-covered integration
var), plus one line of `src/components/game/hextris.tsx` that reads `NODE_ENV` through a
justified `eslint-disable-next-line` for its dev-only `?seed=` replay seam. Everywhere else,
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
  (`src/lib/safe-storage.ts`) for `localStorage` writes/reads that must never throw or trust an
  unchecked cast.
- **Client storage writes only through `safeLocalSet`**: `no-restricted-syntax` bans any
  `.setItem(...)` call — whatever the receiver, so aliasing `window.localStorage` into a local
  doesn't slip past — everywhere except `src/lib/safe-storage.ts` itself (tests and scripts are
  exempt, like the other restricted-syntax selectors). A bare `setItem` throws in private mode, on
  quota, or with storage blocked; the helper swallows that and returns `false`. `getItem` reads
  are not gated (see Known debt).
- **Adding a game** touches three typed places: `src/app/games/games-meta.ts` (the `GameSlug`
  union and the `GAMES` row), `GAME_CONTENT` in `src/app/games/content/` (server-rendered About
  copy, search title and description, FAQ, credits) and `GAME_CLIENT` in
  `src/components/game/registry.tsx` (banner and lazy renderer). The last two are
  `Record<GameSlug, ...>`, so a missing entry is a **compile error**; `registry.test.tsx` and
  `game-content.test.ts` fail if `GAMES` drifts from them. The content test also enforces a
  350-600 word About budget and search-result lengths, and `e2e/seo.spec.ts` gates every public
  game page on server-rendered copy, VideoGame/FAQPage/breadcrumb JSON-LD and its own share image.
  **Share image rule:** Next applies a segment's file-based `opengraph-image.tsx` only while the
  page's metadata leaves `openGraph.images` and `twitter.images` unset. It checks
  `hasOwnProperty('images')`, so even `images: undefined` blocks the file image; never set either
  key on a game page's metadata. Next also appends a `?<hash>` to the file image URL, so tests
  match its path, not the full URL. The `/games` hub is the deliberate exception: it sets
  `openGraph.images` explicitly to restate the site card.
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
- **E2E gate** (CI job `e2e`; runs locally only against a booted build, see RUNBOOK.md): Playwright
  (`e2e/`, `playwright.config.ts`) drives Chrome against the standalone production build.
  Nothing is mocked. The specs read the server's own sitemap, robots.txt, llms.txt and JSON-LD, and
  walk the funnel (Book a Call links, conversion events, the chat launcher, phone width). Every
  request to another origin, the Sentry tunnel, or the AI chat proxy is aborted. The specs that
  fire conversion events skip themselves unless the base URL is localhost, so the suite can never
  write to production analytics. The browser runs with WebGL off (`--disable-3d-apis`). CI runners
  have no GPU, and under software WebGL the home page's two 3D scenes (the background and the
  embedded Orbital Dodge) hold it near 15fps with idle callbacks starved, so clicks lagged past the
  test timeout. No spec drives the 3D scenes themselves. `e2e/webgl-fallback.spec.ts` pins what a
  visitor without WebGL gets instead: no uncaught errors, no canvas, the notice in place of the
  game (see the `WebGLOnly` register entry). The deploy job requires this gate.
- **Gate-disable conventions**: the only sanctioned escape hatch is
  `// eslint-disable-next-line <rule> -- <reason>`. File-level or blanket disables, downgrading a
  rule to `"warn"`, and quietly widening `FS_ALLOWLIST` are all banned outright — fix the code, not
  the rule. When `FS_ALLOWLIST` genuinely must grow, the health route's own entry is the model: a
  comment explaining exactly what the direct fs access does and why a store module doesn't apply.

## Arcade backend

Leaderboard v2 for the arcade games. Orbital Dodge and Hextris are on it (T1b-2), Super Voltorb
Flip's Daily board (T2e), Tower Stacker's daily tower (T6-3), Typing Speed's daily text (T4-4) and Script Knight's daily floor (T7-5); the legacy `leaderboard_entries`
table is frozen history behind a read-only `/api/leaderboard`. Code: `src/lib/arcade/`, route
`src/app/api/arcade/scores/route.ts`.

- **Tables.** `arcade_players` (id, token_hash, handle) and `arcade_scores` with primary key
  `(game, board, player_id)`: exactly one best row per player per board. `score` is BIGINT and
  `detail` is JSONB (the game's validated numbers); `arcade_migrations` (key, applied_at) holds
  the one-time-work markers. Board keys are `all-time`, `daily:YYYY-MM-DD`
  and `weekly:YYYY-Www`, all UTC; weeks are ISO-8601, and the week-year can differ from the
  calendar year (2027-01-01 is 2026-W53). The server computes every key from its own clock; a
  client never names one.
- **Ensure-step convention.** `db/init.sql` runs only on a fresh volume and prod's already exists,
  so the tables are created at first use by `ensureArcadeSchema` (`src/lib/arcade/schema.ts`)
  inside one transaction under a Postgres advisory lock, memoized by `getArcadePool()`. A new
  arcade table goes into `ARCADE_SCHEMA_STATEMENTS` and `db/init.sql`; the pin test
  (`schema.test.ts`) enforces the mirror, statement by statement and in order.
- **Retention.** Each submit deletes that game's daily boards older than 30 days and weekly boards
  older than 12 weeks, in the same transaction. All-time is never pruned. The comparison is
  `board COLLATE "C"` so it does not depend on the database locale.
- **Legacy import (T1b-2).** `importLegacyLeaderboard` (`src/lib/arcade/legacy-import.ts`) runs
  inside `ensureArcadeSchema`'s transaction, once, guarded by a row in `arcade_migrations` (key
  `legacy-leaderboard-import-v1`; renaming the key would re-run the import). It copies the Orbital
  Dodge and Hextris rows of `leaderboard_entries` that carry the detail the game's plausibility
  check needs and pass it (the score must also be an integer within `ARCADE_SCORE_CAP`), as
  all-time rows with the original timestamp and `detail.legacy = true`. Each handle keeps its
  best score per game (handles are sanitized to 12 characters and compared case-insensitively;
  ties keep the earlier row). The report counts `read` rows, `imported` scores (for N players),
  `superseded` rows (a better or earlier row of the same handle won), `unverifiable` rows (NULL
  detail columns) and `implausible` rows, so
  `read = imported + superseded + unverifiable + implausible`; `db.ts` writes them as one log
  line (scope `arcade:legacy-import`). The region is not carried over. The legacy route kept at
  most 100 rows per game, so the 1000-row board cap cannot bind the import. A failure rolls the
  marker back with everything else, so the next request retries; a database without the legacy
  table records the marker and imports nothing. The legacy table itself is never modified.
- **Imported players are unclaimable and merge by name.** Every legacy player has
  `token_hash = 'legacy'`. Same-name legacy rows become ONE player across both games (the handle
  compared case-insensitively, the first and best row naming it), and a name that sanitizes to
  nothing falls back to "Pilot", so all such rows merge into one "Pilot" player. Real arcade
  handles are not unique, so a returning player who picks an old name appears next to the old
  row, not in place of it.
- **The legacy route is read-only: no writer, never dropped.** Tower Stacker was the last game
  posting to `leaderboard_entries`; T6-3 moved it to the arcade, so `POST /api/leaderboard` is
  gone (the route exports GET only, pinned in `api/leaderboard/__tests__/route.test.ts`) and
  `lib/__tests__/legacy-table-frozen.test.ts` fails if any non-test source writes, deletes from,
  alters or drops the table. The GET still serves stored rows of every legacy game (Orbital Dodge,
  Hextris, the classic Tower Stacker). The table stays for fresh volumes (`db/init.sql`) and for
  the import's read; nothing imports the old Tower Stacker rows (different scoring system, no
  detail the new check could verify, and `legacy-import` only knows `LEGACY_ARCADE_GAME_SLUGS`).
- **Tower Stacker's arcade entry is the daily tower.** Detail `{ day, blocks, perfects, streak,
seconds }`. `checkTowerStacker` requires today's UTC day by the server clock (no grace across
  midnight), consistent counts, at most `maxBlocksFor(seconds)` floors (one per 400 ms of
  active play, plus slack) and a score inside `scoreRange(blocks, perfects, streak)` and a
  multiple of 10. Ceilings on client numbers, not anti-cheat, like every check here.
- **Typing Speed's arcade entry is the daily text.** Detail `{ day, ms, chars, acc }` (whole
  milliseconds, net characters, accuracy percent), score = integer net WPM. `checkTypingDailyAt`
  requires today's UTC day by the server clock (no grace across midnight), regenerates that day's
  text with `dailyText`, then `checkTypingDaily` rejects a run under 40 ms per text character (the
  300 WPM ceiling), more characters than the text has, and a score that is not
  `round(chars * 12000 / ms)`. The pure module `typing-speed/engine/daily.ts` is shared by the
  game and the server (node-tested). Ceilings on client numbers, not anti-cheat.
- **Script Knight's arcade entry is the daily floor, and it is a real check.** Detail
  `{ day, turns, hand }` (numbers only), score = the engine's own total, and the action log
  travels as the `proof` (the seam below). The entry sets `requiresProof`; the synchronous
  `checkScriptKnight` requires today's UTC day by the server clock (no grace across midnight) and
  `verifyScriptKnight` rebuilds the day's floor with `dailyFloor`, steps the log through the pure
  engine in chunks of 25 actions (checking `deadline` before each chunk) and rejects, with a
  stable reason: an unreadable log, an action the floor does not grant, a log longer than the run,
  a run that does not reach the stairs, a score that does not match the replay, or turns that do
  not match. Every typed engine failure is a reject; a genuine bug throws and the route fails
  closed (422 `could not verify the run`, reported once). Measured cost: about 6 ms warm for a
  full 200-turn log and about 22 ms for the first call of a UTC day, which also builds the floor.
  `hand` is client-claimed and display-only (see the register).
- **Browser identity.** `src/lib/arcade/identity.ts` keeps `{ playerId, token }` in
  `localStorage` under `arcade:player:v1`. A read never creates one (so first-time visitors stay
  cacheable); the first submit does, with an in-memory copy that wins over storage for the page
  load, so a reset still holds when the write is refused (quota, blocked storage). After a
  successful write the stored value is re-read and adopted, so two tabs on a first visit converge.
  A 403 `identity` response replaces the identity; `useArcadeBoard` does not retry by itself, the
  player submits again. A corrupt stored value is reported with a fixed message, never its
  content.
- **Board hook behaviour.** `useArcadeBoard<G>` (`src/hooks/use-arcade-board.ts`) fetches on
  mount by default (Orbital Dodge and Hextris both pass `fetchOnMount: false` and read at game
  over, so the home-page embed costs no GET), on a tab switch and after a submit, and never polls:
  a 429 or 5xx keeps the last board for a same-period refresh and sets `readError`. A tab
  switch clears the rows, the `you` row and `readError` first, so a failed read shows an empty
  board, not another period's scores. `readError` is set only by reads; a failed submit is
  reported through `submit`'s result (`ok`, `rejected`, `identityReset`) and each game's own
  submit state, never the hook's state, so a failed submit cannot make the board claim it could not
  load. Both games render the board panel (heading, period tabs, body) unconditionally on the
  game-over card; only the body branches (loading, read error, empty for the period, rows), so
  the focused tab never unmounts when a tab switch empties the rows. `submit` is typed to the
  game's exact detail keys (inferred from `ARCADE_GAMES`), never creates an identity for a read,
  and does not POST a score above the cap. `you: null` (a player trimmed off a full board) shows
  the board with no "Your best" row and no error.
- **Daily-seed convention.** Anything that seeds a daily challenge must seed from `utcDayKey`
  (`src/lib/arcade/boards.ts`), so the seed and the daily board turn over at the same instant.
  Password Game 2 follows it: `dailySeed` hashes the UTC day, and its board filters on the UTC day.
- **Higher is better only.** The upsert replaces a row only on a strictly higher score. A
  lower-is-better game (a timed run) needs a new direction column and a store change, not a flag.
- **Identity is trust on first use.** The browser mints a UUID and a 32-byte token; the first
  submit for an id stores `sha256(token)`, and any later submit for that id must present the same
  token (constant-time compare). A mismatch is a 403 and rolls the transaction back. The player id
  and token hash never leave the database. Imported legacy players carry the hash `legacy`,
  which can never equal a real digest, so they cannot be claimed (see "Legacy import" above).
- **Plausibility.** Each game registers a strict detail schema in `ARCADE_GAMES` and a check
  function in `src/lib/arcade/games.ts` (dispatched by `validateArcadeSubmission`): ceilings
  derived from the game's own scoring rules, with one accept and one reject pinned per
  inequality. A malformed detail is a 400; an implausible score is a 422 with a stable reason.
  Adding a game to the arcade = a validator + tests + a hook swap.
- **The proof seam (re-simulated scores).** A game whose score can be re-played on the server
  (Script Knight's action log, Failover's seed plus action log) submits an optional `proof` string
  (at most `ARCADE_PROOF_MAX_CHARS`, 12,000, beside `detail` and inside the unchanged 16 KiB body
  guard; a log, never code). Its `ARCADE_GAMES` entry may set `requiresProof` (a missing proof is
  a 400 `{ error: "proof required" }`, before any check) and `verify`, an async function given
  `{ score, detail, proof, now, deadline }`. The order is: body schema, requiresProof, the
  synchronous plausibility check (400 or 422), then `verify` only if that passed, then the store.
  A game without a verifier ignores `proof`. A reject verdict is the same 422
  `{ error: "implausible", reason }`. A verifier that throws, rejects, returns something that is not
  a verdict, returns after its deadline or never settles **fails closed**: 422 with the fixed
  reason `could not verify the run`, the cause reported once through `captureException`
  (`api:arcade-scores.verify`), never a 500. The budget is `ARCADE_VERIFY_BUDGET_MS` (2,000 ms).
  The verifier runs in-process, so a timer cannot stop synchronous work: `deadline` (epoch ms)
  is handed in and the verifier must check it between chunks and stop; the route also discards a
  verdict that arrives late and abandons one that never settles (`runVerifier`,
  `src/lib/arcade/verify.ts`). **The proof is never stored**: the schema, the store and `detail`
  are unchanged, and a test pins that no query parameter carries it (no server-side leader logs in
  v1). `useArcadeBoard`'s `submit` passes an optional `proof` through as its own body field.
  Every Failover verification logs one `failover.verify` line (outcome pass, shadow-accepted or
  rejected, never throttled, no proof or handle), and the SHADOW rollout is judged on those lines.
- **Board cap: 1000 rows.** Each submit that wrote a row on a board (the upsert's `improved`)
  trims that board back to its top `BOARD_ROW_CAP` (1000) rows by `(score DESC, achieved_at ASC)`,
  in the same transaction, so a flood of fresh player ids cannot grow `arcade_scores` without
  bound (`arcade_players` is not bounded; see Known debt). The trim's `ORDER BY` matches `idx_arcade_scores_rank` exactly and adds no tiebreak column, so
  the planner can walk the index. The submit response keeps the rank computed before the trim: a
  submit that lands below a full board still reports e.g. rank 1001 and `improved: true`, and the
  player's row is gone. From then on a read that passes that player's id gets `you: null` for that
  board. This is intended: a score outside the top 1000 is not on the board. The player row stays
  (see Known debt).
- **Submits for a game are serialized.** The first statement of every submit transaction is a
  per-game `pg_advisory_xact_lock`, taken before the player row lock, so all writers for a game
  take their locks in one order. Without it, concurrent submits on a full board could deadlock
  (40P01, a 500), overshoot the cap until the next trim, or trim a row another submit had just
  improved. The lock is released at COMMIT or ROLLBACK.
- **Reads are rate limited, not guarded.** `GET /api/arcade/scores` is limited to 120 reads per
  60 s per client IP (key `arcade-read:<ip>`; a 429 with `Retry-After`, the same shape as the
  POST's). It has no origin or content-type guard on purpose: the public response is
  CDN-cacheable and holds nothing secret, so any origin may read it. This deviates from the T1b
  plan's note that the GET is unguarded; the limit exists because each read is up to two queries.
- **Driver types.** node-postgres returns BIGINT and `count(*)` as strings and TIMESTAMPTZ as a
  `Date`. SQL casts ranks with `::int`, and the pins in `persistence-schemas.ts` coerce score and
  timestamp (and are strict, so an unexpected column fails instead of reaching the client).

## Games hub

`/games` is a static, server-rendered page (metadata and JSON-LD unchanged) whose body is a
stack of client islands under `src/app/games/hub/`, in this order: the featured card, the Today
strip, On this device, then a "More games" grid. Headings are h1 "Games", h2 featured title, h2
"Today" with h3 tile titles, h2 "On this device", h2 "More games" with h3 card titles
(`games-client.test.tsx` and `e2e/games-hub.spec.ts` pin the outline).

- **Featured.** The `featured?: true` flag on `GameMeta` (set on `space-shooter` only; pinned by
  `games-meta.test.ts`) picks the featured game through `partitionGames`, never array position.
  `GAMES` order is the registry order and is unchanged.
- **Today strip.** `TODAY_SOURCES` names seven tiles: Password Game 2 (its daily board),
  Orbital Dodge, Hextris, Super Voltorb Flip, Tower Stacker, Typing Speed and Script Knight (the
  arcade daily boards). `useHubBoards` starts the seven reads once
  the strip is within 200px of the viewport (immediately if `IntersectionObserver` is missing),
  never polls, and aborts on unmount. `fetchHubBoard` has its own 5 s timeout, never reports, and
  turns every failure into the "Board unavailable right now" tile.
- **On this device.** `hub-stats.ts` reads exactly eight keys (`space-shooter-hs`,
  `orbital-dodge-profile`, `hextris_highscores`, `svf:progress`, `typing-high-score`, `tower:stats`,
  `knight:progress`, `knight:stats`) through guarded parsers, and never writes. `hub-stats.test.ts`
  pins the key list and the setItem absence.
- **The Script Knight chip is floors cleared, not a best.** It reads `knight:progress` for the
  number of floors with a recorded clear across both towers (out of 18) and `knight:stats` for the
  best daily score. `parseKnightFloors` and `parseKnightBestDaily` mirror the game's schemas
  without importing `progress.ts` or `stats.ts` (those pull zod and a storage writer into a client
  island); `hub-stats.test.ts` pins them against the game's own `parseProgress` and `parseStats`,
  case by case. A foreign stored version reads as nothing. The six chips sit two across on a phone
  and three across from `sm`, so none is ever left alone on a row.
- **Stable height.** Each island renders the same height before data, while loading, empty,
  failed and populated (fixed-height tile bodies and chips, a reserved caption), because the
  server HTML is the placeholder state. `e2e/games-hub.spec.ts` compares every state with the
  JS-disabled render within 2px at 390 and 1440 wide.
- **No Suspense around the islands.** `page.tsx` renders `GamesClient` directly. The boundary
  that used to wrap it (from when it read `useSearchParams`) let React stream the hub as a
  hidden segment that only an inline script reveals, so with JavaScript off the page showed no
  games. The JS-disabled baseline in the height test fails if that comes back.
- **Props from the server.** Genre and play-mode chips come from `hubTags()` (server side,
  `GAME_CONTENT`) and reach the client as plain props, so the About copy never enters the
  client bundle. `GAME_CONTENT` carries no `server-only` import, so nothing at the module level
  stops a client file importing it; `src/app/games/__tests__/content-server-boundary.test.ts`
  is the guard. It scans every source file under `src/`, and fails if a `"use client"` module
  imports `GAME_CONTENT` (or anything under `games/content`).

## Voltorb Flip solver

`/games/super-voltorb-flip/solver` is a static page (copy and FAQ in `solver-content.ts`) with one
client island. The solver (`components/game/super-voltorb-flip/solver.ts`) enumerates every board
that fits the ten clues and the flipped tiles, so the odds are exact, not sampled.

- **Weighting.** Each fitting board is weighted by its HGSS deal probability through
  `ACCEPT_RATE` (the share of deals each board config accepts). Clues no recipe produces fall back
  to uniform weighting, and the page says so. `MAX_LAYOUTS` caps the enumeration; past it the page
  asks for a flipped tile instead of guessing.
- **Odds labels.** `formatOdds` never shows 0% or 100% unless the odds are exact.
- **Regenerate on change.** `ACCEPT_RATE` is seeded, 400k samples per board. If `hgss.ts` ever
  changes, regenerate it (the recipe is the comment above it in `solver-prior.ts`).

## Typing Speed

`typing-speed.tsx` is the shell; the engine is under `typing-speed/` (`engine/` is pure and
tested, `use-typing-run.ts` wires it to a hidden input, `corpus/` holds the passages, the common
words and the source list). Every passage is a verbatim excerpt of a Project Gutenberg book,
normalized to ASCII, and the root `NOTICE` credits the 18 works. Do not paraphrase or "fix" a
passage; the corpus test pins the counts and lengths.

- **The engine is word-based and its WPM is net WPM.** Space commits a word, and a wrong letter
  stays inside its own word (up to `MAX_EXTRA` extra letters) instead of derailing the rest of the
  line. Net WPM counts the correct words with their spaces plus the correct prefix of the
  unfinished last word, over 5 per minute; raw WPM counts every character and space keystroke the
  same way. Accuracy is correct keystrokes over all character and space keystrokes, so a corrected
  slip still costs. The result card shows mistakes typed and mistakes left separately on purpose.
  The clock starts on the first character keystroke, not on the Start button. Backspace may return
  into the previous word only when that word was wrong.
- **The hidden input is a sentinel plus the current word.** Its value is always the sentinel plus
  the typed word, so a mobile keyboard has something to delete into, and `diffInput` turns each
  input event into ops. The value is rewritten only when it differs from that expectation;
  rewriting on every event breaks IME composition and the caret. Paste, drop and yank are refused
  in `beforeinput`.
- **Bulk runs never count.** A multi-letter or replacement insert (suggestion tap, autocorrect) is
  marked `bulk`. The run still plays and still shows its figures, but it cannot set a best, a
  ghost or a board entry, and the card says why.
- **`typing-high-score` keeps its format** (a decimal integer string): the games hub reads it.
- **Nine modes, one config.** `engine/modes.ts` maps a mode id (`words-15` ... `quotes-120`,
  `quote`) to a `RunConfig`. A timed run draws a fresh seed per round; the clock is a countdown
  and the run ends from `tick`, not from the last word.
- **`typing:stats` v1 reserves `daily`, `rain` and `prefs`.** Later PRs (daily challenge, word
  rain, preferences) fill them without a version bump, so the schema reads each with a `.catch` fallback to its
  empty default. The loader rejects a newer stored version instead of overwriting it. A bulk run counts only
  toward `runs` and `lastMode`, never a best or the key counts.
- **`typing:ghosts` v1 holds the ghost of your best run per mode, apart from `typing:stats`.**
  A ghost is the run's net characters sampled every 250 ms (`engine/ghost.ts`), at most 481
  samples (a 120 s run), so ten modes stay far under 30 KB. It has its own key so a large or
  corrupt ghost can never cost the stats; a bad entry is dropped on its own and a newer version
  is left alone, like the other keys. `offerGhost` replaces a ghost only on a strictly higher
  net WPM and never for a bulk run, a zero run, or a run past 120 s (it would not fit). The
  daily ghost carries its UTC day and is dropped on load once the day changes. The caret and chip
  place the ghost by net characters along the current text, so a words or quotes run (new text
  each time) races the same pace, not the same letters. The on/off switch is
  `typing:stats.prefs.ghost` (default on); off hides the caret, chip and results overlay but
  runs still update the ghost. The chip is decoration; its live region repeats the pace at most
  once per 5 s, and in the phone sheet it sits in the HUD row so the sheet geometry is unchanged.
- **Word Rain is the `rain` mode, with its own engine and no server.** `engine/rain.ts` is
  pure and seeded (a plain-number rng, so the state compares with `toEqual`); `use-rain.ts` and
  `rain-view.tsx` run it. A typed buffer targets the lowest falling word that starts with it, and
  the spawner never lets one live word start another, so a buffer maps to one word. Positions are
  fractions of the play area and speeds are areas per second, so a 300 px phone area is as hard as
  the 420 px desktop card. The loop clamps dt to 50 ms and stops while the tab is hidden or the
  input is blurred: a paused run neither banks nor loses anything. The best score and wave live in
  `typing:stats.rain` (`recordRain`; bulk runs never count); there is no leaderboard (open
  question 14) and the Ghost toggle and chip do not apply. The timed modes' hidden input stays
  mounted but `hidden` while Rain is on, because `useTypingRun` bound its listeners to it once.
- **The text is a three-line stream.** `text-view.tsx` renders words from a trim index to
  `cursor + LOOKAHEAD_WORDS` and measures each word's `offsetTop` in a frame callback; once the
  cursor is on the third line the first line's words are dropped. The screen-reader copy keeps the
  full text.
- **The graph's last point is the headline.** `wpmSeries` overrides the final point's net WPM with
  `runMetrics.netWpm`, so the chart ends on the same number the card shows.

## Script Knight

The game page is `src/components/game/script-knight.tsx` (the entry, `ScriptKnightGame`) over
`script-knight/`: `engine/` and `sandbox/` are described under Boundaries; `stage.tsx` is the page
(floor and tower pickers, run, replay, result card, epic mode); `run-floor.ts` runs one floor
through the sandbox; `playback.ts` and `use-playback.ts` turn a run into frames and drive the clock;
`view-model.ts` and `floor-view.tsx` draw a frame; `progress.ts` and `code-store.ts` own the two
storage keys. The stage takes named slots (`editor`, `boardPanel`, `handPad`) so the CodeMirror
editor, the daily board and the hand pad are added without rewriting it.

- **Run is two engines.** The sandbox worker runs the player's code and sends one action token per
  turn; the page decodes each token and steps its own main-thread copy of the engine with it. What
  is replayed, scored and saved is that re-simulation, never anything the worker reports about
  health or score. A token the log cannot hold, or one the engine refuses, throws inside the
  `onTurn` callback and the run client ends the run as a crash.
- **Snapshots do not carry health, facing, bound or ticking state.** The engine's `FloorSpace`
  has only the wall, the stairs and a unit's id, name and max health. `view-model.ts` derives the
  rest from the level config plus the event stream (`takeDamage` and `heal` carry
  `remainingHp`, `pivot` a direction, `bind` a target, `tick` the bomb timer), so a frame is
  never read straight off a snapshot. Positions do come from the snapshot.
- **Storage.** `knight:progress` holds, per tower, the highest floor reached, the best score,
  grade and turns per floor, and the best epic run; `knight:code` holds one Player per tower (see
  the register); `knight:sound` is the mute flag. Writes go through `safeLocalSet`, reads through
  `safeJsonParse` and zod with per-field fallbacks, and a store written by a newer build is read
  but never overwritten (`stored-version.ts`). Code is capped at 20,000 characters and saved 500 ms
  after the last keystroke.
- **Towers.** The Narrow Path is always open; Powder Keep opens once floor 9 of the Narrow Path has
  a best. Epic mode is offered once a tower's floor 9 is cleared, and runs the same code through
  all nine floors with every ability.
- **Runs are tokens.** A Run press makes a token (tower, floor, epic mode, cancelled flag). Stop,
  navigation and unmount flip it, an epic run checks it before each floor, and a result for a token
  that is no longer the live one is dropped. The guard against a second Run is a ref, not state.
- **Phone targets.** Every control the game owns carries `TOUCH` (`surface.ts`), so it is 44 px
  square on a coarse pointer, and `touch-targets.test.tsx` pins it. The site header and footer are
  not the game's.
- **Today's floor.** `daily.ts` generates one Narrow Path style corridor per UTC day, seeded by
  `fnv1a("knight-daily-v1-<day>")` and the attempt, with the epic ability set (the full set the
  warrior has at the end of the tower). The reference bot must clear it, with at least two enemies
  and a par of 8 turns or more; after 64 attempts the fallback is a Narrow Path floor in epic
  configuration chosen by the day number (none of the 365 days tested from 2026-10-01 fell back).
  The bot's score is the par and the grade's ace score. `DAILY_RECIPE` is a version: change the
  generator and bump it, and the pinned 2026-10-15 layout in `daily.test.ts` shows the diff. The
  floor is memoized for one day. The worker builds it from a `{ kind: "daily", day }` ref with the
  same function the server uses, so the page, the worker and the verifier agree. The day is fixed
  when the player opens the tab: a run that finishes after 00:00 UTC is still replayed but cannot
  be posted. The daily code lives in `knight:code.daily` and starts from the tower's code each
  day; a cleared daily updates `knight:stats` (best, runs, streak) and nothing in the tower
  progress.
- **Replay links, the ghost, Watch the bot and share (T7-6).** A replay link is a URL fragment,
  `#replay=1.d.<yyyymmdd>.<log>` or `#replay=1.t.<np|pk>.<level>.<0|1>.<log>`, so it is never sent
  to a server and needs no route; the log is the action-log codec's own body (`replay-link.ts`
  parses strictly under 600 characters and returns null for anything else). The entry reads the
  fragment (and `hashchange`) and mounts `ReplayViewer` above the stage, which replays the log with
  the pure engine on the main thread (`played.ts`), no worker. A link that does not parse, does not
  play on its floor or leaves actions over reads "This replay link is damaged". "Play this floor"
  remounts the stage on that floor through the `start` prop, clamped by `start-at.ts` to what the
  player has reached (the notice says so); a link to a daily of another day still plays but "Play
  today's floor" opens today's. The ghost is `knight:stats.ghost` (`{day, log, score}`, your best
  daily clear of that day, replaced by a strictly higher score or a new day): the stage reads it
  when a run starts and the floor view draws it as a translucent knight matched by turn. It is
  drawn only; no run, score or proof sees it. Watch the bot replays the reference bot on the floor
  in view, local and unranked: it writes no progress or stats, shows no result card or board, and
  posts nothing. Share builds "Script Knight, 2026-10-15: 112 points in 23 turns (par 98)" plus the
  link and uses `navigator.share`, then the clipboard (`share.ts`, after Tower Stacker's).
- **The editor is a textarea first and CodeMirror 6 on a desktop pointer.** `editor-host.tsx` (the
  stage's default `editor`) always paints the textarea, then on `(pointer: fine)` loads
  `code-editor.tsx` with a dynamic `import()` after mount and swaps it in with the same text,
  caret and focus. A coarse pointer never fetches the chunk, and a failed load keeps the textarea
  (reported once). The set is minimal on purpose (view, state, commands, language,
  lang-javascript, and `@lezer/highlight` for the colours; not the `codemirror` meta package):
  about 136 KB gzipped by the planner's measurement (a minified rolldown bundle of the same
  imports measured about 125 KB; no local Next build was run).
  `editor-lazy.test.ts` pins that only `code-editor.tsx` and `syntax-check.ts` import the
  libraries and that nothing reaches the chunk except that one `import()`; CI's build is the
  final proof. A syntax error is found by walking the lezer tree for error nodes, marked with a
  gutter marker and a wavy underline, and its line is remembered by the stage: the sandbox's own
  syntax message has no line in V8, so a Run adds the editor's line and the player reads
  "Line 4: Unexpected token '}'" through the usual message path. The lezer line can differ from
  the engine's by recovery, which is why the message text still comes from the sandbox.
- **Play by hand and the phone sheet.** One engine, two ways to play, chosen with the Play style
  switch and stored as `knight:mode` (`{"v":1,"mode":"hand"|"code"}`; nothing is stored until the
  player picks, a coarse pointer defaults to hand and a desktop pointer to code, malformed storage
  reads as the default). `use-hand-run.ts` keeps only the list of actions and derives the run by
  replaying it on the main thread (no player code, so no worker); undo is the replay of the log
  minus its last action, and its log, frames and result equal a code run's with the same moves,
  so a hand run posts the same proof and the server verifier accepts it unchanged. A finished
  hand run is recorded once (tower progress or the daily stats) and posts `hand: 1`. The pad
  (`hand-pad.tsx`) has a chip per granted action and four arrows laid out as they point on screen
  but meaning forward, right, backward or left for the way the knight faces; keys (WASD or the
  arrows, letters or 1 to 8, Z) are taken with `preventDefault` only while a hand run is live.
  Epic runs are code only. On a coarse pointer "Play this floor" turns the stage itself into the
  fixed full-height sheet (`play-sheet.tsx`: `fixed inset-x-0 z-80`, as tall as the visual
  viewport above the keyboard, page scroll locked, Exit on top); in code mode the Run bar sticks
  to the sheet's bottom and the floor column folds away while the keyboard is up, so Run is never
  below the fold while typing.
- **An idle run ends in about a second.** A program that does nothing idles to the 200-turn limit
  and the replay used to show each of those turns for 300 ms. After the third quiet turn in a row
  (nothing changed on the floor, in health or in score) `frameDelayMs` shows each further frame
  for 4 ms. Only playback timing changed: the engine, the scores and the log are as before, and
  the instant speed is unaffected.
- **Launched (T7-8).** The `GAMES` row no longer carries `hidden`, so the game is indexable, in the
  sitemap, llms.txt, the hub grid, a Today tile and a device chip. CI's `seo.spec.ts` gates its page
  (About copy, VideoGame/FAQPage/breadcrumb JSON-LD, its own OG image). The About copy and credits
  describe only what the code does today. `featured` stays on Orbital Dodge.

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
  game, not decoration — do not "fix" this into obeying the OS preference. The home page's WebGL
  background (`components/three/geometric-background.tsx`) is chrome, not a game. Under the OS
  preference it freezes rather than unmounts, as the CSS aurora does. It switches to
  `frameloop="demand"`, and its `useFrame` callbacks skip any frame that is not an `"always"`
  frame, so it draws one still pose and redraws it only on resize. The embedded Orbital Dodge
  keeps moving.
- **Every react-three-fiber Canvas mounts behind `WebGLOnly`** (`components/three/webgl-only.tsx`).
  three.js needs a WebGL2 context. Without one, its renderer throws "Error creating WebGL
  context." inside R3F's async Canvas setup: an unhandled rejection no error boundary catches,
  repeated on every render of the Canvas (about 20 per home page load before the gate). The gate
  asks once per page load, on a throwaway canvas. Where the answer is no, the home background
  renders nothing, so the CSS `BackgroundFX` layer is the whole backdrop and the three.js chunk is
  never fetched; Orbital Dodge, on the home page and on `/games/space-shooter`, shows the
  `NeedsWebGL` notice instead. A software-rendered context still counts as WebGL: the gate asks
  whether three.js can start, not how fast it will run. A new Canvas outside those two wrappers
  needs the same gate.
- **The `/games` grid shows the 7 public games.** Failover alone is `hidden` (until its launch);
  the flag in `games-meta.ts` is the way to take a game out of rotation without deleting code (the
  route still works if visited directly, but its page is `noindex` and it is left out of the
  sitemap and every "other games" list). Tower Stacker was hidden until its first-party rebuild. `password-game` (The Password Game 2) is `external: true`: its card is live in
  the grid, but it links to its own top-level route (`/games/password-game`) outside the shared
  game-loader rather than to a `[slug]` page; it is still in the sitemap. The first public game
  renders as a featured card spanning both columns, so an odd count never leaves a lone card in
  the last row.
- **Orbital Dodge pauses itself and never resumes itself.** A live run pauses when the window
  loses focus, when the tab is hidden, or when less than 35% of the game is on screen (the home
  page embed scrolled away), so a run never plays out unwatched; the player always resumes. The
  scene is always the dark space palette: the light-theme "inverted armed" menu backdrop was
  removed because it read as muddy grey, and its dormant `invertedArmed` flag has been deleted.
- **Orbital Dodge opens busier than it ends (early boost).** `difficulty()` adds
  `EARLY_BOOST` (0.35) fading linearly to zero by `EARLY_FADE_S` (45 s), so the ramp reads 0.60 at
  0 s and is identical to the old curve from 45 s on; the cap and the mobile x0.88 are untouched.
  Heavy asteroids unlock at 12 s (was 25) and the first wall arrives `FIRST_WALL_MS` (10 s) in
  (was 20). The spawn interval still floors at 280 ms (about 3.6 spawns/s), inside
  `checkSpaceShooter`'s budgets; `space-shooter/__tests__/plausibility.test.ts` pins that. Kill
  sounds rise with the combo through `killPitch`, and the combo chip flashes on each new
  `comboTier`; both are cosmetic and never feed scoring.
- **Orbital Dodge ends with a beat and restarts with a countdown.** A fatal hit freezes the
  wreck for 90 ms, then runs it at 0.35x for 400 ms (`deathTimeScale` in `space-shooter/death.ts`);
  only the wreck physics is scaled, so the staged bursts and `onDeath` keep their 2.2 s wall clock.
  The death card counts score and coins up, shows a score-vs-best bar and the next unlock
  (`post-run.ts`), and lists where the coins came from (pickups plus the Coin Boost bonus, which
  is every term `onDeath` banks). Fly Again resets to armed (`resetToArmed`) and starts a 3 s
  countdown (`countdown.ts`) that starts the run by itself; opening a panel, pressing Escape or
  pressing Play cancels it. That auto-start follows only an explicit Fly Again tap: a paused run
  still never resumes itself.
- **Super Voltorb Flip waits for the player at the end of every round.** The order follows HGSS
  (`voltorb_flip.c`): a win plays the clear fanfare and then the payout over the still-hidden
  board, and only then reveals it; a quit pays out first too (when it banked coins); a loss goes
  straight to the reveal. A result banner then names the outcome and the level change and offers
  Continue / Next round; a tap on the board or any key also continues. HGSS waits for a press
  after a clear as well, so the earlier auto-advance on a win is gone on purpose. The banner
  lives in a slot under the board, never over it (the revealed board is worth reading). While a
  round is live the slot shows a one-line hint plus the Quit button, so it keeps its height and
  the page never jumps.
  The wait ignores keys whose target is a text field (`game/text-entry.ts` `isTextEntryTarget`), so the AI
  chat can be typed in while a banner is up. The banner wording lives in `round-result-copy.ts`
  (original text; paraphrase, never Nintendo's strings) and keeps the reserved height, 72px below
  sm and 60px from sm, which `round-result.test.tsx` pins.
- **Super Voltorb Flip's sound is original and mostly synthesized, and its cue lengths are a
  timing contract.** Effects and the three fanfares (round cleared, round lost, risk warning) are
  generated at runtime with Web Audio from the pure tables in `super-voltorb-flip/sound-cues.ts`
  (scheduled by `synth.ts`, behind the `audio.ts` facade); no ripped game audio ships. The
  background loop is one of three CC0 tracks picked by level band in `music.ts` (Lv.1-3, 4-6,
  7-8), with per-track volumes trimmed to equal loudness. A cue's `ms` is what the round flow
  waits on: the win sequence awaits the clear fanfare, the risk fanfare locks the board for
  `RISK_WARNING_MS` (2100) plus a 500 ms beat before the flip commits (muted waits the same
  `RISK_WARNING_MS + 500`, so muted and unmuted pacing match; `__tests__/audio-timing.test.tsx`
  pins both), and `sfx.*` promises resolve at the cue's end even with no `AudioContext`. Changing a
  cue length is a gameplay-timing change, not a sound tweak. The synth helpers are copied from
  Password Game 2's rather than imported, by the cross-game convention.
  `__tests__/assets-guard.test.ts` fails if ripped audio paths, unreferenced files or
  unattributed music come back.
  The muted clear wait is `LEVEL_WIN_MS`, not a literal (T2d-1): `audio-timing.test.tsx` runs the
  clear wait in both modes and pins the payout start at exactly that length.
- **Super Voltorb Flip's art is original and defined as text.** The orb, memo glyphs and clear
  mark are character maps in `super-voltorb-flip/art/sprites.ts` rendered as inline SVG by
  `PixelSprite`; the bomb burst, success sparkle and spinning coin are pure frame geometry in
  `art/fx.ts` drawn by `art/frames.tsx`. No sprite image ships, and the GPL-3.0 cartridge sprites
  that used to ship (samualtnorman/voltorb-flip) were removed along with the scripts that fetched
  and processed them. The orb is deliberately not the Pokemon creature (an indigo sphere with a
  lightning bolt); to redraw anything, edit the strings and keep the grid size. The game keeps
  its CSS look and the "Super Voltorb Flip" name, and shows an unofficial-fan-recreation
  disclaimer in the About credits and in the How to play modal.
  `__tests__/assets-guard.test.ts` fails on any image under the game's public folder, any
  reference to a sprites or upstream path, and any asset-prep script that targets them.
- **Tower Stacker is first-party; its rules are pinned.** No third-party code or asset ships in
  the game: the vendored upstream bundle is deleted, `no-third-party-tags.test.ts` pins that
  there is no such folder under `public/`, and `assets-guard.test.ts` allows no audio outside
  Voltorb's music folder (so there is no NOTICE entry; the credits say "Original game built for
  this site"). The numbers that define the game are pinned by
  `tower-stacker/__tests__/engine.test.ts` and `scoring.test.ts`: perfect within 8 units of
  centre, a trim needs 4 units of overlap or the run ends, every third perfect regrows 12
  (capped at the starting width), points are 10 per trim and 20 to 60 per perfect. There are no
  lives, on purpose: the tower cannot drift out of reach, because the crane sweeps around the
  top slab. Do not tune a constant without updating its pin and the copy in
  `games/content/tower-stacker.ts`.
- **Tower Stacker keeps its blueprint palette in both themes, deliberately.** The canvas uses
  `tower-stacker/palette.ts`, not the site tokens; do not wire it to the theme toggle.
- **The Hextris engine is a clean-room rewrite; keep the wall.** T5-3 replaced the GPL-3.0
  port of upstream Hextris (Logan Engstrom et al.) with an engine written only from the
  behaviour spec `docs/specs/2026-10-hextris-engine-behaviour.md`. Its author never read the old
  engine or the upstream source; the integrator, who did read the old shell, added glue only
  (`hextris/feedback.ts` maps engine events to sound, haptics and React state;
  `hextris/session.ts` holds the high-score list, the arcade submission and the seed). The
  engine (`hextris/engine/`) is a seeded fixed-step simulation that emits events, the painter
  (`hextris/render/`) is a pure function of the run, and `hextris.tsx` is the shell. The shell and
  UI code `hextris.tsx` kept (overlays, HUD, input, fullscreen and sound wiring) is site-authored
  and carries no upstream engine code.
  `hextris/__tests__/provenance-guard.test.ts` fails if any file under `hextris/` or
  `hextris.tsx` carries an upstream identifier or tuning constant: grow its denylist, never
  loosen it, and never port behaviour from the upstream or from this repo's pre-T5-3 history
  (those versions stay GPL-3.0). A rule change starts in the spec. The About credits say
  "Inspired by Hextris" and link the upstream; `content/__tests__/hextris-credits.test.ts` pins
  it. The shell reads `NODE_ENV` once, through a justified `eslint-disable-next-line`, for the
  dev-only `?seed=<uint32>` replay seam (spec section 12.3); production always draws a fresh
  seed.
- **The daily tower is the only ranked Tower Stacker mode.** The arcade registry takes one
  detail schema per slug and a board only means something if every score on it was earned on the
  same tower, so only `dailyTowerSeed(today)` runs can be submitted. Free build (a random or
  `?tower-seed=` tower) is unranked on purpose: it keeps a local best in `tower:stats` and its
  over card offers a route to the daily tower instead of a form. Do not add a second ranked mode
  without a second slug or a detail field the check can verify.
- **Tower Stacker's check bounds the score by the landings, not by replaying the run.**
  `checkTowerStacker` cannot see the drops, so it brackets the score: `scoreRange(blocks,
perfects, streak)` gives the lowest and highest total any run with those counts could earn, and
  the claim must sit inside it and be a multiple of 10. The floor count is capped at
  `maxBlocksFor(seconds)`, one landing per 400 ms of active play plus slack, because a crane
  cycle cannot be driven faster. These are ceilings on honest-client numbers, forgeable like
  every other check in this file. The day must equal the server's UTC day with no grace across
  midnight, so a run that crosses midnight is refused at the card (it shows a closed message and
  no Submit) as well as by the server.
- **Typing Speed's board takes the daily text only, posted by hand.** The registry takes one
  detail schema per slug and a board means something only if every score came from the same text,
  so the timed modes and Quote stay local (`typing:stats`). Attempts on the daily are unlimited and
  kept in `typing:daily` (versioned, one UTC day, the handle survives the day); nothing posts
  automatically, the player presses Post for the best attempt. The WPM ceiling is 300 with no
  grace across midnight: a Post rechecks the UTC day and a run that crossed midnight shows a
  closed message and a button for the new text instead of Post (the Tower Stacker pattern). A run
  typed with phone suggestions or autocorrect (`bulk`) counts as an attempt and shows locally but
  can never become the best or be posted, and both the results card and the Daily panel say so.
  The score is computed from the rounded integer milliseconds the server will see, so the
  client's WPM and the server's recomputation agree to the digit. The Daily view is never the
  mode the page opens in (`recordRun` leaves `lastMode` alone for it), and its board is read only
  while the view is open. The streak is kept in the reserved `typing:stats` `daily` fields by UTC
  day (`recordDay`, `streakAsOf`), and any finished daily attempt keeps it.
- **The legacy Tower Stacker scores stay where they are.** The old `leaderboard_entries` rows for
  `tower-stacker` are read-only history served by `GET /api/leaderboard`. They are not imported
  into the arcade tables: they were scored by the retired embedded game, a different scoring
  system with no detail the new check could verify, so mixing them would put unverifiable numbers
  next to verified ones. Nothing writes the table (a source guard test enforces it) and it is
  never dropped.
- **An idle Hextris run scores 0, on purpose.** Before T5-4 a run left alone scored about 997:
  pieces kept landing and matched by chance, and that score could be posted to the board. The
  guard lives in the engine (spec section 6.9, `AFK_AFTER_MS` in `hextris/engine/scoring.ts`):
  before the first input, and from 8 s after the last one, the player is away. An away clear
  still removes its cells and counts toward the level, so the board does not jam, but it scores
  0 and adds no combo, chain, momentum or clean-sweep bonus. Starting the run is not an input,
  so a tab opened, started and abandoned scores nothing. Do not "fix" an idle 0. The shell's
  only UI for it is a quiet "Away" line above the meter after 8 s of play, and
  `content/__tests__/hextris-copy.test.ts` pins the About copy to the engine's numbers.
- **The Hextris clear shake and game-over marks follow the OS reduced-motion preference, the
  only Hextris effects that do.** They are an exception to "Reduced-motion is inverted between
  chrome and games": the shake moves the whole board (a CSS translate on the canvas, eased to 0
  over 250 ms), which is the kind of motion the preference exists for. After game over the
  painter pulses the overflowed side and bursts particles on a new best (`PaintEnding` in
  `hextris/render/paint.ts`). Under the preference the shell passes `newBest: false` and holds
  `sinceMs` at 0, so the side shows a steady highlight and there is no burst. The "+N" popups,
  the countdown and the rest of the game's motion stay ungated. The shell reads
  `prefers-reduced-motion` once per mount.
- **The Hextris Panic Clear tip shows once per browser.** `hextris/tips.ts` stores
  `{"v":1,"panicSeen":true}` under `hextris_tips` as the tip shows, so a reload never shows it
  again. The games hub never reads that key; `HUB_STAT_KEYS` stays an allowlist of score keys.
- **Hextris restarts with one key or tap, but only 1.2 s after game over.** Before T5-5 a run
  could only be restarted with the sheet's "Play again" button, so the player saw the score
  first. The lockout keeps that aim: Space, Enter or R (`hextris/input.ts`, phase `over`) or a
  tap on the board start the next run, through the countdown, only `RESTART_LOCKOUT_MS`
  (`hextris/game-over.ts`) after the end. The router still swallows those keys during the
  lockout, so a held Space does not scroll the page. A tap on the sheet never restarts, and "Play
  again" works at once. `content/__tests__/hextris-copy.test.ts` pins the About copy's "1.2
  seconds" to the constant. Do not shorten the lockout to "fix" a key press that seems to do
  nothing.
- **Script Knight's game surface is a fixed dark panel in both site themes, deliberately.** The
  floor, the event log, the result card and the editor use `GAME_SURFACE` (`script-knight/surface.ts`),
  which sets a dark background and redefines `--foreground`, `--muted` and `--border` inside it, as
  the other games keep a dark playfield. `surface.test.tsx` pins 4.5:1 for its text and 3:1 for its
  glyphs. Copy outside the panel (briefing, abilities, controls) uses the themed tokens and
  `text-accent-green`, which turns dark green in the light theme. Do not put `#4ade80` text outside
  the panel.
- **Super Voltorb Flip and PG2 render light-styled in both site themes, deliberately.** Their
  chrome is period/genre styling, not the site palette — do not wire them to the theme toggle.
- **The shared leaderboard row is reused loosely across games, by design.** Hextris stores
  blocks-cleared in the `kills` column and writes a `level` the UI never surfaces; player-name
  inputs cap at 12 characters (`maxLength` plus a slice in the handler). Only worth revisiting
  if the raw columns are ever exposed publicly. Since T6-3 nothing writes the legacy table any
  more; Hextris's arcade rows keep blocks-cleared in `detail.kills`, which its plausibility
  check relies on.
- **`maxDuration` is deliberately absent from the LLM route** (`src/app/api/copilotkit/route.ts`).
  It's a Vercel-only directive and a documented no-op on this self-hosted deployment — the
  code's own comment calls it out as the same class of theater `env.ts`'s honesty pass removed
  elsewhere. The real control is an in-handler 60-second deadline via `createDeadlineFetch`,
  merged with the inbound request's own abort signal.
- **Super Voltorb Flip deals and scores by the HGSS rules** (`super-voltorb-flip/hgss.ts`,
  ported from pret/pokeheartgold 9d8b759). The 80 board layouts, the free-multiplier re-roll
  (including its quirks: a deal is accepted after 1000 rejections, and a placement call gives up
  after 100 collisions), the level rule and the Lv.8 streak are the decomp's, pinned by
  `hgss.test.ts`. Do not tune them. Flips after a round ends are ignored, which retired the old
  NF(P7)-a re-entry quirk on purpose. Only `?size=N` boards (dev and layout testing) still use
  the formula deal in `engine.ts`.
- **Super Voltorb Flip's phone board trades gap for tile.** Below sm the frame is the viewport minus
  16px, the gap ratio is 0.2 (not the desktop 0.28) and the inner padding is 4px, so a 5x5 board
  gets 44px tiles at 360px wide (`board-size.ts`: the constants, `BOARD_FRAME_CSS` and a unit test
  that pins the 44px floor across 360-639px). From sm up every value is the original. Narrower than
  360px the floor is best effort. The phone memo bar sits on its own row at 44px faces (`spread`);
  the desktop bar is untouched.
- **Super Voltorb Flip's keyboard layer is board-scoped, not global.** Tiles use a roving tabindex
  (one tab stop) inside a `role="group"`; the cursor is real DOM focus drawn by `:focus-visible` (the hover red frame plus a dark rim, one ring).
  The handler is a React `onKeyDown` on the grid, never a `document` listener, so it cannot see keys
  typed in the AI chat; the one document-level listener (the round-end wait) skips text fields via
  `isTextEntryTarget`. `1`, `2`, `3`, `V` mark the tile under the cursor without changing the memo
  bar's selection. Edges clamp rather than wrap. Do not move the handler to `document`.
- **Super Voltorb Flip's mount-time music start waits for the page `load` event, and a blocked loop
  retries on the first gesture** (`startup.ts` `afterPageLoad`, `audio.ts` `retryMusicOnGesture`).
  The MP3 fetch used to start during page load; it is now off the load path. This was not an LCP
  fix: the LCP of the game page was already the server-rendered tagline, not the game.
  `e2e/voltorb-lcp.spec.ts` observes the page's LCP in a real browser and asserts the element is
  page content, not the game. Do not move the music start back into the hydration effect.
- **Super Voltorb Flip's face-down tile labels include its memo marks** ("Row 1, Col 1, face down,
  memo 2, V") and flips are spoken through one polite live region. The announcement only ever
  carries a tile that has already been flipped, so it never leaks a hidden value (the leak guard
  covers it).
- **Quit's confirmation starts on Keep playing**, unlike HGSS's yes/no prompt, which starts on
  Yes. A mis-tap should not end a round.
- **Voltorb Flip settings, statistics and memo undo are local, forgeable and separate from the save.**
  `svf:settings` (`{v:1,memoUndo,stats,assist}`) and `svf:stats` are their own keys, parsed field by
  field with defaults, and never touch `svf:progress` or `svf:muted`. Statistics are display-only
  like "On this device": a visitor can edit them, nothing reads them to gate anything, nothing is
  uploaded. An assisted round counts as played and assisted only, so wins, coins and best stay
  honest; highest level mirrors `svf:progress` and counts every round. Time at Lv.8 adds at most
  one hour per round (a forgotten tab).
- **Memo undo is a toggle replay, not a snapshot.** `flagCell` is a toggle, so undoing a change is
  the same call on the same tile. An entry for a tile that was flipped since is skipped (flipping
  clears the flags). The stack is bounded (50) and cleared when a new round starts. Ctrl/Cmd+Z is a
  React handler on `.svf-root`, not a document listener, so it cannot see keys typed in the AI chat;
  the text-field guard is a second belt. Shift+Z is left alone.
- **The new Voltorb buttons are text, not sprites.** The mode row (Settings, Statistics, later
  Daily) uses text labels in the light chrome, like How to play. Owner ruling: the CSS chrome stays;
  the one new sprite is the Undo glyph, drawn like the Clear X.
- **The odds assist reuses the T2b solver unchanged and runs off the main thread.** `solve()` is
  exact: a 5x5 board takes a median 1.6 ms, p95 17 ms and up to about 160 ms for an empty board at
  round start (measured with the shipped solver, 600 random boards, node 22). `solve-client.ts`
  posts the clues to a Web Worker (`solver-worker.ts`) and answers a latest-wins promise; with no
  Worker, or if it errors, the same solver runs inline from a `setTimeout(0)`. One client (one
  worker) serves every solve while the assist is on, and is disposed when it goes off. It is off by
  default and not a hint button: it shows the Voltorb chance on every face-down tile and speaks it
  in the tile's aria-label. The odds are a probability, not a promise: the solver weights layouts
  by how HGSS deals boards, so a "0%" tile is exact and a "12%" tile still loses one time in eight.
  The badge hides on flipped tiles, under the peek debug view and during the flip-down, the same
  gates the memo marks use (`tileOddsView`).
- **An assisted round is sticky and never counts.** If the assist was on at any point while a round
  was live, the round is assisted even if it was switched off again; the banner says so, statistics
  count it as played and assisted only, and the Daily board (T2e-3) has no assist at all.
  Switching it on while a result banner is up affects the next round, not the
  one just over. This is honesty bookkeeping on a local, forgeable record, not enforcement.
- **Chess-puzzle's inner replay-consistency guards are intentionally silent** — they re-validate
  state that upstream callers have already validated once; a second failure there indicates the
  first guard's own invariant broke, which is a bug in the guard itself, not user input worth
  reporting again.
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
- **PG2 plays in a stage shell, not a flowing page** (`stage/game-shell.tsx`, `stage/hud-slots.ts`,
  `stage/hud-actions.tsx`). From 1024px the stage card is sticky beside a rule column that scrolls in
  its own region; below that the run plays in a fixed phone sheet (`z-80`, toasts `z-85`, act title
  card `z-90`) sized by `visualViewport` (`--pg2-vv-h`, `--pg2-vv-top`) with `pg2-lock` on `<html>`
  for the whole run, released on Exit and on unmount. The page container is `max-w-6xl` to fit two
  columns; the editorial blocks stay `max-w-5xl`. The canvas overlay paints meters only inside the
  reserved HUD bands (`hudSlots`), never over the password; the event action chips are DOM buttons
  (44px) in the top band. The old "best played on desktop" banner is gone on purpose. Exit needs a
  second tap. Games are exempt from reduced-motion, so the chip hop is not gated.
- **Typing Speed plays in a phone sheet** (`typing-speed/play-sheet.tsx`, `sheet-layout.ts`,
  `typing.css`). Below 1024px (`(max-width: 1023px)`, the PG2 breakpoint) a tap that starts typing
  (Start, the text, Restart, Again) opens a fixed `z-80` sheet sized by `visualViewport`
  (`--ts-vv-h`, `--ts-vv-top`) with `typing-lock` on `<html>` while it is open; Exit, finishing a
  run and unmounting all release the lock. The sheet is the same wrapper element as the page's
  text stack with a different class, so the text view never remounts when it opens; the page
  chrome behind it is `inert` (the game's own wrappers only; the navbar and footer are not, and sit hidden behind the sheet). It holds a one-row HUD (time, WPM, Restart, Exit), the three-line
  text and, only while the keyboard is closed and the viewport is at least 560px, the live graph;
  nothing in it animates a rise. `sheetLayout` steps the font from 22 to 18px below 420px so the
  HUD plus three lines always fit, and below 230px (a phone in landscape with the keyboard up) it goes to 14px with tighter padding. `/games/typing-speed` alone exports
  `interactiveWidget: "resizes-visual"` through `generateViewport` in `[slug]/page.tsx`, so the
  keyboard shrinks only the visual viewport there. The hidden input is always mounted (outside the
  sheet's render), `fixed` at the top of the visible area, 16px so iOS does not zoom, and is
  focused synchronously inside the tap; Exit and finish blur it, which closes the keyboard. If it
  loses focus mid-run the sheet says "Tap the text to keep typing" and the clock keeps running
  (pausing would let a player bank thinking time). Exit abandons the run. On finish the results
  card is scrolled into view. The visual viewport hook (`src/hooks/use-visual-viewport.ts`, with
  `viewport-layout.ts`) is shared with PG2; it moved out of PG2's stage folder in this change so
  neither game imports the other. The sheet has no Skip button on purpose: a Quote passage ends by finishing it or by switching mode. Tablets of 1024px and up get no sheet, so the software keyboard can cover the passage there.
- **The Typing Speed stats bar reserves two rows below `sm`** (`min-h-12 content-start`). At 390px
  the streak and best badges wrap the bar from one 20px row to two (48px); reserving the height
  keeps the passage from jumping when they appear at the end of a run.
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
- **PG2 pulls the next event forward once an act's rules are solved (pull-forward pacing).** The
  authored clock used to leave a fast solver idle for up to ~100 s at an act gate. Now, when every
  core rule of the act is revealed and passing (`engine/pacing.ts`, called from `tick`), each
  unstarted inhabitant and the single earliest unstarted blocking event are rescheduled to
  `actElapsedMs + PULL_FORWARD_BEAT_MS` (4 s). Pulled events are staggered: in authored order,
  each lands at least one beat after the previous pulled one, so they never arrive on the same
  frame. One blocking event at a time, so act 2's overlapping force slot is serialized by
  pull-forward rather than stacked. Events are never dropped or delayed: the gate still waits for
  every blocking event of the act to resolve and every inhabitant to have arrived and left
  telegraph, so a fast player meets the same set, only sooner. A rule that regresses during the
  beat does not cancel the pull, precisely because events are never delayed or dropped. Act 3
  never advances on time; the same pull shortens the wait before submit opens. Measured for seed
  7 with the instant solver: act 1 158.8 s to 17.4 s, act 2 158.0 s to 33.8 s, finale 521.3 s to
  178.3 s.
- **PG2's sound is on by default once the player taps Start** (`sound/audio.ts`). The stored
  `pg2-sound` key reads as: absent = on, `"0"` = off, legacy `"1"` = on (the old default was off, so
  only an explicit `"0"` is an opt-out worth keeping). Nothing plays before the first gesture:
  `unlockAudio()` runs from the Start tap, the sound toggle, the first pointerdown and the first
  keydown, creates the context, resumes it when the browser left it suspended, and opens the gate
  `playCue` checks. Key ticks have their own 30 ms rate limit in the shell, separate from the 150 ms
  effect-flood debounce, so fast typing is not swallowed.
  Known and accepted: the very first cue after Start is dropped while the browser's `resume()` is
  still pending (`playCue` needs a running context), rather than queued and burst out later.
- **PG2's rule-card motion is a hand-rolled Web Animations FLIP, and it ignores reduced motion on
  purpose** (`stage/flip.ts`, `stage/use-flip.ts`, `.pg2-rule-*` in `pg2.css`). framer-motion is a
  dependency but is not imported into PG2: the shell re-renders on a 250 ms heartbeat, and a hook
  that animates only on a rule-order change is trivial to test. `useFlip` reads layout offsets
  (`offsetTop`, never a transformed rect) after every commit so they cannot go stale, animates only
  when the order key changes, starts from the card's visual offset when a slide is still in flight,
  and forgets the previous run's positions when `runId` changes. With the phone keyboard open the
  list does not slide (a ~150 px viewport has no room for it) and the active rule is followed exactly as in
  T3-2 (`scrollIntoView({ block: "nearest" })` on its `li`), now from a layout effect. Entrances there fade
  without the 12 px rise, which would otherwise leave the followed rule's bottom below the fold for ~400 ms.
  Games are exempt
  from `prefers-reduced-motion` (see above), so none of this branches on it, and PG2's existing
  reduced-motion block is left as it was. The entrance, reorder, colour blend and shake are
  separate properties on separate elements (the shake and entrance on the card button, the FLIP
  transform on its `li`) so a regression, which also moves the card to the top, plays both.
  A rule that regresses shows a one-line reason: the live event's name, or the neutral "This rule
  is no longer satisfied". The shake, the reason and the fail cue fire only after a player or engine
  change (a password edit, widget input, or an event rewriting the password); a flip driven by the
  clock alone just recolours, and a recovery always cues. The reason is announced by one persistent
  polite region beside the rule list, prefixed "Rule N:" and cleared on recovery so the next
  regression is read out again; the in-card reason text is `aria-hidden`.
- **PG2's event telegraphs are read off engine state by the stage, not added to the engine**
  (`stage/telegraph.ts`, `stage/telegraph-banner.tsx`, `stage/use-telegraph-cue.ts`). An instance
  is telegraphing when its data is set and its phase is still `"telegraph"`; the time left is its
  def's `telegraphMs` minus the phase clock. From that one derivation the stage card's edge glows
  in the family colour (`--pg2-tg`, a `::after` at z 26, between the canvas and the HUD), a banner
  names the soonest threat in voice ("Invaders inbound") with a seconds countdown, and a family
  cue plays once per instance. The banner lives in the reserved bottom HUD band, absolutely
  placed, so nothing in the layout moves and the phone keyboard sheet keeps the active rule and
  the password in view; it steps right of the FUEL meter while the campfire is live. The banner is
  `aria-hidden`: a separate persistent polite region, outside any button, carries the label only,
  so it is read once and not on every heartbeat change of the countdown. The cue goes through the
  shell's `playSound` (sound on, unlocked by a gesture, running context, 150 ms per key), and a
  WeakSet of instances keeps the 250 ms heartbeat from replaying it. galaga, snake and tetris
  already emit `telegraph-doom` from the engine on their first telegraph tick, so the stage skips
  them (`ENGINE_EMITS_TELEGRAPH`, checked against the engine by its test) and every telegraph
  start is exactly one cue. The edge tint's pulse and the banner's ring are not in the
  reduced-motion block, so they run under reduced motion too: an opacity and colour pulse at about
  0.9 Hz (1.1 s), with nothing moving across the screen, exempt as game state the player needs.
  Known and accepted: the autocorrect tell pill and the banner can say similar things at once.
- **PG2's event art is drawn larger through one table, and narrows rather than leave the card**
  (`stage/art-scale.ts`, `stage/painters.ts`). `ART_SCALE` holds each painter's factor (1.4 or
  more) and painters multiply sprite sizes, strokes and offsets by it. Art anchored near an edge
  (the black hole on an end glyph, the galaga fleet on a 390 px phone) narrows through `fitScale`
  or its column spacing to stay inside the stage card, so on a phone some of it draws at less than
  its table factor. The black hole's telegraph keeps its stroked warp lines a pixel inside the
  card. The galaga fleet's top row sits a ship's reach (wing, glow or 22 px target) under the
  measured HUD band (`hudRect`, from `data-pg2-hud`), so no ship covers the timer or steals a tap
  from copy, mute or exit, and its sway, dive and carry are clamped by the same reach. Hit circles
  never go below a 22 px radius (`hitRadius`). A parasite's target follows the pointer
  (`stage/hit-test.ts`): a fine pointer gets the glyph's own box; a coarse one keeps a 44 x 44
  floor, but a tap inside a neighbouring glyph's box goes to the caret, and where regions overlap
  the nearest centre wins. The art test paints real forced runs on 390 and 360 px phone cards
  (keyboard down and up) and a desktop card, and checks every drawn point, text by its measured
  width, stays on the card with no slack; it probes every target through `pickHit`.
- **PG2's hit-stop freezes the painters' clock, never the game** (`stage/hit-fx.ts`,
  `stage/canvas-overlay.tsx`). A press that lands on an alien, a parasite or a finale missile (the
  engine changed `version` or a hit counter) bursts seeded sparks from the target's centre, holds
  the canvas art still for 60 ms and shakes the card 3, 5 or 9 px by weight, fading over 180 ms.
  The engine keeps ticking through the hold, so timers and the run clock are unaffected. The hit
  shake uses the same `--pg2-shake-*` variables as the engine's trauma shake and does not branch
  on reduced motion; PG2's existing reduced-motion CSS still pins the card's transform, for both
  shakes alike. The act title card wipes in and out with a `clip-path` across its 2.2 s, keyed by
  act so a queued card wipes again. That rule sits after the reduced-motion block on purpose, so
  it overrides the block's `animation: none` on `.pg2-titlecard`: the wipe is the card's own 2.2 s
  timing, not a flourish. A restart drops the last run's sparks.
- **PG2's rules and hints live on their own static page, behind closed spoiler guards**
  (`src/app/games/password-game/hints/`). `/games/password-game/hints` is server-rendered from
  `hints-content.ts`: `RULE_HINTS` is keyed by `CORE_RULES` id and `EVENT_HINTS` by `EVENT_DEFS`
  id, and an exhaustiveness test fails when a rule or event has no entry. The page exists for
  search and answer-engine reach on "password game 2 hints" without putting spoilers on the game
  page. Every hint sits in a closed `<details>` (never `open`), summaries are spoiler-free titles,
  and no hint names a seeded value (the tests ban digit runs of 4 or more), so they hold for every
  run.
- **PG2's bests and daily streak are per device, in `pg2:stats`, by design**
  (`src/components/game/password-game-2/stats/`). One versioned (`v: 1`) zod-parsed key, read
  tolerantly (missing, corrupt or wrong-version data is empty stats) and written through
  `safeLocalSet`, the `svf:stats` precedent. A stored `v` above 1 was written by a newer build
  (a rollback, an old tab): it reads as empty and `saveStats` skips the write, so it is never
  destroyed. A corrupt value is reported once per page load at most; the newer-version case is
  expected and never reported. No server table and no arcade-v2 backend: the PG2 leaderboard
  keeps its own route, and bests and streaks are display-only and forgeable, so nothing gates on
  them.
  A streak day is a UTC day with a completed DAILY run (the daily seed is UTC, so a streak day is
  a seed day). The day recorded, shared and used for the streak is the UTC day the run STARTED,
  so a run that crosses midnight UTC still counts for its own seed; the receipt's printed date
  stays the day it renders. `streakAsOf` shows a streak as live through today and yesterday and
  as zero after a missed day or a last day in the future, while the stored value only resets when
  the next daily is recorded. A last daily AHEAD of a new run (a clock set forward once) resets
  the streak to the run's day instead of freezing it. History keeps the last 14 daily days in day
  order, so a back-dated entry never evicts newer days.
  What counts: the daily (however it is reached) and normal random runs. A run with a forced
  `?event=` is practice, and a run on an explicit non-daily `?seed=` is a shared challenge, not a
  personal best; neither is recorded. The shell records a victory exactly once per run (a ref
  keyed on run id and seed). Day arithmetic is `Date.UTC` on the string day, so it is timezone
  independent.
- **PG2's daily share is text first.** The receipt's Share button builds a spoiler-free,
  ASCII-only line (time, the run's start day for a daily, a streak of two or more, the game URL;
  never the password, rule text, a seeded answer or the biggest crisis) and hands it to
  `navigator.share`, falling back to the clipboard; a dismissed share sheet is a quiet no-op. For
  the daily, where the browser can share files (`navigator.canShare({files})`), the same button
  also shares a 1200x630 PNG card drawn on a canvas (`stats/share-card.ts`, no dependency). The
  card is rendered when the receipt mounts, not on the tap: the click handler is synchronous, so
  `navigator.share` and the clipboard write run inside the user activation (iOS Safari drops it
  across an await). If the PNG is not ready yet, or its render fails, the tap shares the text
  only. A tap while a share is in flight is ignored.
- **PG2's page names the game once, in a server-rendered h1 above the stage.** The h1, the intro
  and the credit ("An independent tribute to The Password Game by Neal Agarwal. Not affiliated
  with neal.fun.")
  render from `PASSWORD_GAME_PAGE_INTRO` and `PASSWORD_GAME_CREDIT` in
  `src/app/games/content/password-game.ts`; the old sr-only h1 is gone. The stage shell's own
  "The Password Game 2" wordmark is a styled `<p>`, not a heading, so the page has one h1 and no
  competing h2 for the same name.
- **PG2's chess widget accepts and plays a WRONG move** — the SAN is written to the password and
  the board keeps the position for retry; the rule simply stays unsatisfied. Rejection-on-entry
  would leak which move is best. The best-move/accept list shipping to the client is inherent to
  client-side validation and registered as such, not a leak to fix.
- **`/llms.txt` is a route handler, not a file in `public/`** (`src/app/llms.txt/route.ts`,
  `force-static`). The hand-written file went stale (it linked a `/work` page that did not exist
  and missed newer posts); the route builds it from the same data modules as the pages, so a new
  project, post or FAQ entry appears there on the next build. Do not put a `public/llms.txt` back:
  it would shadow nothing and silently drift again.
- **One FAQ source, three renderings.** `src/data/faq.ts` feeds the visible FAQ section, the
  home page's `FAQPage` JSON-LD, and llms.txt. The answers are built from the other data modules
  (projects, services, profile) so they cannot contradict the page. The E2E suite asserts the
  markup and the visible text match; edit the data, never one rendering.
- **No `Review`/`AggregateRating` markup on `/reviews`.** It looks like a missed rich result, but
  Google treats reviews a site publishes about itself as self-serving and ineligible; marking them
  up risks a manual action for no gain.
- **Projects are `CreativeWork`, not `SoftwareApplication`.** `SoftwareApplication` rich results
  require `offers` plus a rating, which these projects do not have, so Search Console reports the
  markup as invalid. `CreativeWork` carries the same entity link (`creator` to the Person) without
  the error.
- **Conversion tracking is one delegated click listener** (`ConversionTracker` in the root layout,
  `src/lib/analytics.ts`), not an `onClick` on each Book a Call link. The links live in server
  components, and every new CTA is tracked automatically as long as it points at `BOOKING_URL`, a
  `mailto:`, or a `socialLinks` URL. The listener never calls `preventDefault`, so tracking can
  never break a link.
- **Arcade scores are trusted up to plausibility ceilings; this is not anti-cheat.** The games run
  entirely in the browser, so every submitted value is client supplied. The registry rejects
  fabricated short runs and absurd claims; it cannot catch moderate inflation on a long run, and
  it is not meant to. Do not "fix" it by adding client signatures or telemetry: nothing in the
  browser is secret from the player.
- **Arcade player ids are client-generated (trust on first use).** There are no accounts. The
  token protects an id from being taken over after its first submit; it does not stop one person
  minting many ids. A cleared browser starts a new player. Both are accepted for a portfolio
  leaderboard.
- **One CI-only test talks to a real Postgres.** `store.db.test.ts` is the sole exception to "tests
  never touch a real database". A mocked pool cannot prove the upsert, `rank()`, `COLLATE "C"`
  and row-lock SQL, and prod may only be read, so the test runs against a throwaway service
  container in CI, behind a guard that refuses any host but localhost/127.0.0.1 and any database
  but `arcade_it`, and it never reads `DATABASE_URL`.
- **Legacy rows were imported once and frozen; the import is lossy on purpose.** Rows with NULL
  detail columns or implausible values, and the region, are not carried over; each handle keeps
  one row per game; same-name rows merge into one player (fallback-name rows into one "Pilot").
  Imported players cannot be claimed (`token_hash = 'legacy'`), so a returning player starts a
  fresh arcade identity. Do not "repair" this by loosening the plausibility checks for old rows.
  Prod's legacy leaderboard was empty when Part 1 deployed (2026-10-06), so the import is
  expected to move 0 or very few rows there; the machinery matters for fresh environments and
  for rows that arrive before the T1b-2 deploy.
- **Orbital Dodge shows no region.** The browser's ipapi.co lookup (a third-party call on every
  visit to the game) was removed with the field, and the arcade board stores none. Nothing in
  the CSP or the config referenced ipapi.co. Do not reintroduce a client-side geo lookup without
  a privacy decision.
- **The featured game is a static flag, not a computed ranking.** `featured?: true` on one
  `GameMeta` row decides the hub's lead card. Picking by plays or score would need a read on
  every page view for a page that is otherwise static. Change the flag by editing
  `games-meta.ts` (and its test), not by adding logic.
- **The Today strip reads public, cacheable endpoints, deferred, and never with a player id.**
  The arcade read and the Password Game 2 read both answer anonymous requests with
  `s-maxage=10, stale-while-revalidate=30`. The hub never passes `player=` (that response is
  `private, no-store`, per visitor, and would tie the hub to a browser identity), so a hub tile
  never shows "you". The reads wait until the strip is near the viewport so a visitor who never
  scrolls to it costs nothing.
- **"On this device" is display-only, forgeable and never sent.** The numbers come from
  localStorage, which the visitor can edit; they are clamped, parsed defensively and shown with
  the label "Best on this device" (Voltorb Flip: "Saved progress", never "best level"). Nothing
  is written, uploaded, compared with a board or used to gate anything. It does not read
  Password Game 2 storage, `walletCoins` or `arcade:player:v1`.
- **The Password Game 2 daily is one UTC day for the seed and the board.** `dailySeed` hashes the
  UTC calendar day and the board's `daily=1` filter is `(created_at AT TIME ZONE 'UTC')::date =
(now() AT TIME ZONE 'UTC')::date`, so it no longer depends on the Postgres session timezone.
  The tile says "(UTC)". On deploy day the seed moves for players outside UTC (their local date
  and the UTC date differ for part of each day), so that day's daily board mixes the old and new
  puzzles. No migration is needed; the board turns over at 00:00 UTC.
- **Read cost of the hub.** One visit that reaches the strip issues five arcade reads and
  one Password Game 2 read. The arcade read is rate limited (120 per minute per IP), so a visitor
  who reloads dozens of times sees "Board unavailable right now" on the arcade tiles, not an
  error; the Password Game 2 read has no rate limit. Both are cacheable for 10 s at the edge.
- **The Voltorb tile reads the same public daily arcade board the other two do.** The Voltorb daily
  board is keyed by the UTC day on the server, the same day the game seeds from, so unlike Password
  Game 2 the tile is exactly today's board. The strip is one column on phones, two at md and three from xl; a lone last tile
  (or chip) spans the row below that, so no card is left alone. "On this device" reads a sixth
  key, `tower:stats` (best daily and best free score), through `parseTowerStats`, read-only.
- **The Daily board is one seeded board per UTC day, and the server regenerates it.** The seed is
  `svf-daily-v1-<YYYY-MM-DD>` (UTC, so it agrees with the arcade `daily:` board key) through the pg2
  `fnv1a` and `mulberry32`, then `pickBoardId(5)` and `generateLayout`. The `v1` is a version: change
  the recipe and an old day's board shifts under its stored scores, so bump it. Golden vectors for
  three days are pinned in `daily-board.test.ts`. Lv.5 because its max payouts (384-576) make a win
  a real result and a partial bank a meaningful score without a coin-flip board.
- **The Daily validator checks what the board can pay, not that the run was honest.**
  `checkVoltorbDaily` regenerates the day from the server clock and rejects a score above the
  board's maximum, a score that is not 2^a * 3^b within the board's 2s and 3s, too few flips for it,
  more flips than safe tiles, and any `day` that is not today's UTC day. It is still a ceiling on a
  client-supplied number (see "Arcade scores are trusted up to plausibility ceilings"): a player can
  post any score the board allows, and a cleared board is the cap for that day. There is no grace
  window across 00:00 UTC; a round that runs past it cannot be posted and the screen says so. The
  route reads the clock once and hands the same instant to the validator and the store.
- **`daily-board.ts` is a lib-to-components import on purpose.** The validator needs the exact
  generator the game uses, and duplicating `hgss.ts` on the server would let the two drift. Both
  files are pure and DOM-free (types-only imports plus the pg2 rng); `daily-board.test.ts` runs in
  the node environment so a DOM touch fails it. Do not move React or storage into either file.
- **One counted attempt per device, kept by replaying the flips.** `svf:daily` stores the ordered
  list of flipped tiles; a reload rebuilds the board and replays them, so refreshing never rerolls.
  Clearing site data or using another browser is a second attempt: this is a device-level rule on a
  trust-on-first-use leaderboard, the same as everything in "Arcade player ids are client generated".
  The server's upsert keeps only a strictly higher score, so a second posted attempt can raise but
  never lower a player's row. The Statistics Reset does not touch `svf:daily`, so a reset cannot buy
  a second attempt.
- **The Daily board has no odds assist, no level movement and no history.** It runs on its own
  `VoltorbFlip.daily(...)` instance, so winning or losing it never moves the player's level, the
  main round history, or `svf:progress`. Nothing on the Daily screen reads the assist setting, and
  its round banner never says "Assisted". The main game stays mounted but hidden while the Daily
  board is open, so a trip to Daily does not lose the main round; its undo is off meanwhile.
- **The Voltorb leaderboard rows are daily results across all three boards.** A submit writes the
  all-time, weekly and daily boards like every arcade game, so "all-time" for Voltorb means the best
  single daily result and "weekly" the best of the week. The Daily panel and the Today tile read the
  daily board only. The legacy localStorage import and the legacy row schema keep their own
  two-slug list (`LEGACY_ARCADE_GAME_SLUGS`): Voltorb never had legacy rows.
- **Streak: consecutive UTC days, kept alive by any played board.** A win or a quit that banked at
  least one coin extends it. A loss or an empty quit counts as played, neither extends nor breaks
  it, and carries its day forward, so only a UTC day with no board played lapses it (shown as 0 from
  then on, the best is kept). Display-only and local like the rest of the statistics.

- **Unknown directions throw in Script Knight.** Upstream WarriorJS lets any string that is not a
  relative direction fall through to `left` (`relativeDirections.ts`), and abilities never
  validated it, so `walk('north')` quietly walked left. The port calls `verifyRelativeDirection`
  in every direction-taking ability and sense, and the turn facade checks the direction at the
  call, so `'north' is not a direction: use forward, right, backward or left.` is a player error
  and the action-log alphabet stays closed (four directions and "none"). `deviations.test.ts` pins
  it. Do not restore the fall-through.
- **The Script Knight turn object is a frozen facade.** Upstream hands player code the unit's own
  turn state, whose `action` field is writable, so `warrior.action = ['detonate', []]` set an
  action without going through the method. The port hands out a frozen object with ability methods
  only (`engine/facade.ts`); an action method records into the turn once (a second one throws the
  upstream text), a bad direction fails the call without spending the turn's action, `rest` drops
  any argument, and the facade is revoked at `endTurn` so a kept reference throws
  `That turn is over`. The sandbox in T7-2 wraps the same facade with its per-turn caps.
- **Script Knight events carry unit ids.** Upstream identifies a unit by name only, so two Sludges
  are indistinguishable between events. Each `FloorSpace.unit` and `TurnEvent.actor` gains an `id`
  (the unit's index in `floor.units`; the warrior is 0). The parity test strips the ids before
  comparing against upstream's final maps.
- **Each Script Knight run owns its own Logger.** Upstream keeps one module-level singleton, so two
  runs stepped alternately would mix their logs and a second run would inherit the first's turns.
  The port holds the `Logger` in the `Level` and `Floor`, and `deviations.test.ts` steps two runs
  alternately to pin it.
- **`think` formats with a guarded `JSON.stringify`, not `util.format`.** The engine must stay free
  of `node:util` (it runs in the browser and in the sandbox). Strings print as they are, primitives
  by `String`, an `Error` by its message, anything else as JSON, with a placeholder for a cyclic or
  throwing value, joined by spaces and cut at 200 characters. Upstream's `%o` placeholder test was
  changed on purpose: `%o` is now printed literally.
- **A Script Knight run that uses all 200 turns ends as `out-of-turns`.** Upstream fails it
  silently, so a caller could not tell running out of time from dying. `RunStatus` has the extra
  member; scoring treats it as not passed, exactly as upstream does.
- **Detonating a ticking captive does not crash Script Knight.** Upstream throws `Captive has no
position` there: `Detonate` damages the captive (which removes it), then its chained `Ticking`
  asks the removed unit for its neighbours. On Powder Keep levels 6 and 7 epic that corrupted the
  run. The port reads the floor from the unit's floor link when it has no position, reads every
  bombed space before the first bomb falls (the chained blast can remove the warrior itself), and
  skips units with no health left. Everything else is upstream's outcome: the explosion still kills
  everyone alive, once. `detonate-ticking-captive.test.ts` pins it with the real classes.
  Beyond that one case, `step` and `endTurn` are atomic: any other exception inside the engine ends
  the run as `engine-error` (a typed `StepResult` failure), and the half-played turn is not
  counted or returned.

- **Player code runs only in a per-run Web Worker.** Script Knight evaluates the visitor's own
  JavaScript with `new Function` (`sandbox/compile.ts`, the one place, with a plain comment
  saying why; `no-new-func` is not enabled), and only inside a fresh Web Worker that the page
  terminates after the run. Never on the main thread, never on the server (the guard test
  fails the build if `src/app/`, `src/lib/`, `src/hooks/` or `engine/` imports `sandbox/`). The
  threat model is the visitor's own code in the visitor's own browser: the worker protects the
  page from its mistakes (loops, crashes, stray globals) and keeps pasted code away from the page
  and its storage. It is **not a network boundary**: `lockDown` withholds the usual network APIs so
  nothing reaches out by accident, but a dynamic `import()` of a remote module still works and
  nothing here stops it. Score integrity does not depend on it, because the page re-simulates
  the run from the action tokens the worker posts and the server does the same. `lockDown` runs
  before any player code and removes `fetch`, `XMLHttpRequest`, `WebSocket`, `WebSocketStream`,
  `EventSource`, `WebTransport`, `RTCPeerConnection`, the raw socket constructors, `importScripts`, `indexedDB`, `caches`, `BroadcastChannel`, `Worker`,
  `SharedWorker`, `postMessage`, `onmessage`, the listener APIs, `close`, the timers,
  `queueMicrotask`, `requestAnimationFrame`, `navigator`, `location`, `performance`, `crypto`,
  `reportError` and `dispatchEvent` (the last two would let player code raise a crash report
  with its own text) from the scope and its whole prototype chain (`REMOVED_GLOBALS` is pinned by a test); the
  worker captured its own `postMessage` first, so the player cannot post or forge a message. A name
  that cannot be removed stops the run as a crash instead of running the code. **Nothing is
  frozen**, on purpose: a player can pollute prototypes inside its own worker, which can only
  change what its own senses return, and freezing intrinsics would break ordinary code through the
  override mistake for no integrity gain. The page enforces its deadlines from outside
  (`run-client.ts`), since synchronous code cannot be interrupted from inside. The worker posts
  `booted` once its bundle has loaded, so a slow download or parse on a phone is never held
  against the player: boot has its own 10 s limit (a breach is "The sandbox could not start."),
  and the clock for the player's code starts at `booted`: 1,000 ms to `ready`, 250 ms between
  messages, 5,000 ms overall, then `worker.terminate()`. The facade caps
  1,000 ability calls and 10 think lines per turn. Anything the worker posts that does not fit
  `parseFromWorker`, or arrives out of turn order, ends the run as a crash. There is **no
  main-thread fallback**: without Workers the player is told so and can still play by hand. The
  remote `import()` is accepted because the code is the visitor's own and the worker holds no
  secrets. An `async playTurn` (or any returned promise) is refused with a player error, since its
  action would land after the turn. **Untested engines:** the line-number offset and a clean
  `lockDown` (no stuck names) are verified only in Chromium (Chrome and Edge); Firefox and WebKit
  are untested. If a CSP is ever added, the worker needs `'unsafe-eval'` for `new Function`.

- **Script Knight's tower code is one evolving Player per tower.** Moving between floors keeps the
  tower's single saved program instead of giving each floor its own: the code is the player's
  solution so far, and later floors extend it, as in upstream's one Player file per profile. Reset
  to starter replaces it for the current tower only. The daily floor's code is a separate slot
  (`daily`).
- **Script Knight's replay animation ignores `prefers-reduced-motion`.** The floor renderer slides
  units and pulses a ticking bomb unconditionally. This follows "Reduced-motion is inverted between
  chrome and games" above: the replay is the game, and a frozen floor would be unplayable. The
  playback speed select (including instant) and the pause control are the way out of the motion.
- **A Script Knight run that stops early is still replayed.** A timeout, a thrown error or a
  crash keeps the turns that arrived before it, replays them, and then shows the reason, so a
  player sees how far the code got. Only a run that never produced a turn (no Worker, a syntax
  error) has nothing to replay. The no-Worker message points the player to Play by hand,
  which needs no Worker.

- **Script Knight's "by hand" tag is client-claimed and display-only.** `detail.hand` (0 or 1)
  is the only part of a daily submission the server cannot check: the same log is legal whether
  code or a person produced it, and code can hard-code a move list for a visible floor, so the
  two are not separable. The board shows a "by hand" badge on `hand: 1` rows and ranks them with
  everyone else; nothing gates on the tag. The stage sets it to 1 for a daily cleared in hand mode.

- **A Script Knight replay link proves nothing.** It carries a log anyone can write, the viewer
  plays it for fun, and nothing about a link is ranked, stored or posted; the daily board still
  takes only a verified submission from a real run. The ghost's `score` is stored beside its log
  only so a later clear can be compared with it without replaying; it is never shown or sent.

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
  meaningful progress on RC-3 or mostly relocated code without reducing the monolith was left
  open. Moot since T5-3: the clean-room engine replaced the inline one outright.
- **The absence of an HTML contact form is intentional, not a gap.** Lead capture happens through
  the AI chat widget's "talk to a human" flow plus a "Book a Call" link, not a traditional form.
  This was reframed during review as deliberate product personality for an AI consultancy,
  implemented consistently across the site — don't "fix" it into a form.

## Extract-before-edit doctrine

Any future gameplay change to `space-shooter.tsx` starts by extracting the
touched subsystem into its own tested module first, following the pattern `super-voltorb-flip/`
and `password-game-2/` already establish (a plain, seedable, unit-testable engine module; the
component file left as the render/glue layer). Hextris is extracted (T5-3): a Hextris gameplay
change goes into `hextris/engine/`, test first, and `hextris.tsx` stays glue. Do not add logic
to the Orbital Dodge monolith in place:
that is exactly the change-cost pattern the audit measured directly (a site-wide reduce-motion
change touched 32 files; adding a game touches 3 dispatch points by design, but editing an
already-inline engine has no such bound).

## Change guide

**Copy or content change** (blog post, page text, game description/tagline): edit the relevant
MDX file under `content/blog/` or the metadata in `games-meta.ts` / page component directly. A
game's About copy lives in `src/app/games/content/<slug>.ts`; any gameplay change that makes a
sentence there untrue updates it in the same change. No gate beyond the standard sweep applies
specifically to content changes.

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
  branch untouched. It reads the stream rather than using a library hook because 1.54.1 had none
  that worked: `CopilotRuntime`'s `onError` was declared but never read on this path (and its
  own docs called it a paid Cloud feature), the `observability_c` call sites were commented-out
  TODOs, and `createCopilotEndpointSingleRoute` accepted only `{ runtime, basePath, cors }`.
  As of 1.77 `onError` is honoured without a key and fires for upstream HTTP errors and
  mid-stream failures, so a hook is now possible and would be less fragile than reading frames
  off the wire; the tap stays, pinned by `route.integration.test.ts`, until someone makes that
  switch deliberately.
- **`arcade_players` rows are never pruned.** Trimming a board to its 1000-row cap, or retention
  deleting an expired daily or weekly board, removes `arcade_scores` rows but leaves the
  player row behind, so the table grows without a bound of its own: growth is limited only by the
  POST rate limit (10 submits per minute per client IP). Each row is small. Trigger: the table
  reaching a size that matters, or a privacy request; the fix is a periodic delete of players
  with no score rows left (and, for an abandoned player, the data-surgery recipe in `RUNBOOK.md`).
- **RC-3: full engine extraction for `space-shooter.tsx` (Orbital Dodge)** (High severity, large
  effort). Deferred; the extract-before-edit doctrine covers incremental progress. Trigger: any
  gameplay-affecting edit to it. Hextris left this item when T5-3 replaced its engine.
- **RC-6 — a user-facing motion/settings toggle** (Medium). The current fix is OS-preference-only
  (chrome honors `prefers-reduced-motion`, games opt out). A user-facing in-app toggle, and a
  shared settings provider to host it, remain undone.
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
  error boundary. Undone. (WebGL missing at page load is handled, see the `WebGLOnly` register
  entry; losing it mid-session is not.)
- **A dedicated `localStorage`-usage lint rule** (audit ref NF-P5-b) — CLOSED 2026-09-17 for
  writes: `no-restricted-syntax` now bans any `.setItem(...)` call outside
  `src/lib/safe-storage.ts` (see Conventions in force), and the eight raw writers — hextris,
  space-shooter, the Orbital Dodge profile store, Super Voltorb Flip's progress and mute
  persistence, PG2's sound toggle — moved onto `safeLocalSet`. Two of them (`use-mute.ts` and the
  Voltorb progress effect) had no try/catch at all and would have thrown where storage is blocked.
  Residual: `getItem` reads stay convention — `typing-speed.tsx`'s high-score read and
  `use-mute.ts`'s initial read run outside any try/catch, so a `SecurityError` on storage access
  still crashes those renders. Trigger for closing that half: a `safeLocalGet` helper plus a
  matching `getItem` selector, or the next report of a game blanking in a locked-down browser.
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
- **PG2's remaining canvas-only targets have no DOM equivalent** (`stage/painters.ts`).
  Canvas hit regions for parasites, aliens and missiles are pointer-only:
  a keyboard or screen-reader user cannot reach them, and some are under 44px on a phone. The event
  action chips were moved to DOM buttons in T3-2; these were not. Known debt, same family as the
  `RuleCard` nested-interactive item above; trigger is the next PG2 accessibility pass.
- **Some defensive branches are provably dead** (audit ref NF(P7)-b) — error paths guarding
  conditions that current callers can no longer produce, left in place as cheap insurance rather
  than removed.
- **Coverage thresholds are repo-wide, not per-file** (audit refs NF(P7)-d, P2-TEST-003) — a
  single well-tested module can currently offset an untested one; the ratchet only guards the
  aggregate. (The companion scope debt NF(P7)-c is resolved: pass-2 set coverage `include` to all
  of `src/`, so untested files now count in the denominator instead of being invisible.)
- **Untested single-file games** (audit ref P2-TEST-004) — resolved. Typing Speed is rebuilt on
  a tested engine (see the Typing Speed section) and Tower Stacker under `tower-stacker/` with
  tests.
- **Tower Stacker sizes itself from `window.resize`, not a ResizeObserver** (T6 review item 8,
  accepted): it reads the parent column width on mount and on resize, so a column that changes
  width without a window resize (a sidebar toggle) keeps the old size until the next one.
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
