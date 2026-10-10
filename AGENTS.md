<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from
your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any
code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Agent onboarding

Personal portfolio: Next.js 16 App Router (TypeScript strict), Tailwind v4, self-hosted via
Dokploy. This file is the entry point; two companion docs carry the depth — read them before any
non-trivial change:

- **RUNBOOK.md** — production operations (health, logs, deploy, rollback, restart, data surgery,
  monitoring reality) and this machine's dev-environment pitfalls.
- **DESIGN.md** — boundaries, gate-enforced conventions, the intentional-design register (things
  that look wrong but are deliberate — check here before "fixing" one), the change guide, and
  known debt.
- **README.md** — human quickstart (install, scripts, project structure).

## Commands

```bash
pnpm dev              # docker compose up --build — brings up Postgres (the db service) and
                       # the app together; the app waits for the db healthcheck, then runs a
                       # production build in a container (no Turbopack hot reload). Needs a
                       # local .env (POSTGRES_PASSWORD + the required vars) or it will not
                       # boot. No host port is published by default — see RUNBOOK for local
                       # browser access and the bare `next dev` escape hatch.
pnpm start             # docker compose up -d — the same stack, detached
pnpm test              # vitest run, once
pnpm test:coverage     # vitest run --coverage (ratcheted floors — see DESIGN.md)
pnpm test:e2e          # Playwright against a RUNNING production build (E2E_BASE_URL); not
                       # part of the sweep below — CI runs it, RUNBOOK has the local recipe
pnpm format            # prettier --write
```

Full gate sweep — run before every commit; tests BEFORE build, `rm -rf .next` after:

```bash
pnpm format:check && pnpm exec oxlint -c .oxlintrc.json . && pnpm lint && pnpm typecheck && \
  node scripts/check-env-drift.mjs && node scripts/check-action-pins.mjs && \
  node scripts/check-root-files.mjs && pnpm exec knip && \
  pnpm test && pnpm test:coverage && pnpm build
```

## Architecture

- `src/app/` — App Router pages plus API routes (`src/app/api/*/route.ts`): the games
  leaderboard, leads, the AI chat proxy, health, Password Game 2's own leaderboard, and the
  password-game feed proxies that back its live rules (chess-puzzle, countries, wordle).
  `src/app/monitoring/route.ts` is the Sentry browser tunnel (top-level, not under `/api`, so
  ad blockers don't eat it).
- `src/lib/` — server-side utilities: the Postgres pool (`db.ts`) and persistence stores, the
  request guard chain, the upstream fetch wrapper, structured logging, GitHub/GA4 clients.
- `src/components/game/` — the games, each self-contained; see DESIGN.md before editing one.
- `src/app/games/content/` — each game's server-rendered About copy and SEO fields
  (`GAME_CONTENT`); `src/components/game/registry.tsx` is its client twin (`GAME_CLIENT`).
- `content/blog/` — MDX blog posts, loaded via `src/lib/blog.ts`.
- SEO/AEO surface: `src/lib/structured-data.ts` builds every JSON-LD node from `src/data/`
  (`profile.ts` is the entity source, `faq.ts` the FAQ), and `src/app/llms.txt/route.ts`
  generates llms.txt from the same data. `e2e/` holds the Playwright suites that check them, and
  the funnel, against a real build.
- Persistence is Postgres (the compose `db` service): `src/lib/db.ts` hands out a shared `pg`
  pool via `getPool()`; the leaderboard routes, Password Game 2's leaderboard, and
  `leads-store.ts` read and write tables created by `db/init.sql` (run once on the db volume's
  first start). Row shapes are pinned by zod in `persistence-schemas.ts` — see RUNBOOK.md's Data
  section.
- Arcade leaderboard v2: `src/lib/arcade/` (UTC board keys, per-game plausibility registry,
  store, ensure-step) behind `src/app/api/arcade/scores/route.ts`. Its tables are created
  idempotently at first use and mirrored in `db/init.sql`; see DESIGN.md's "Arcade backend".
  Orbital Dodge, Hextris, Super Voltorb Flip, Tower Stacker and Typing Speed (its daily text) read
  and write it through `src/hooks/use-arcade-board.ts`. `/api/leaderboard` is a read-only archive of the frozen
  legacy rows (no POST, the table is never written or dropped).
- `/games` hub: `src/app/games/hub/` holds the client islands (Today strip over the public daily
  reads, read-only "On this device" stats) behind the static `src/app/games/page.tsx`; the
  featured card is chosen by `featured` on `GameMeta`. See DESIGN.md's "Games hub".
- Voltorb Flip solver: `src/app/games/super-voltorb-flip/solver/` (static server-rendered page plus
  the client island `solver-client.tsx`) over the pure solver in
  `src/components/game/super-voltorb-flip/solver.ts`. See DESIGN.md's "Voltorb Flip solver".
- Script Knight engine: `src/components/game/script-knight/engine/`, a pure TS port of WarriorJS
  (MIT) with an action-log codec, a step API and a reference bot, a Web Worker sandbox for the
  player's code in `sandbox/`, and the game page (`stage.tsx`) around them. See
  DESIGN.md's "Script Knight" section and the Script Knight register entries. Its daily floor
  (`daily.ts`) ranks on the arcade board through a proof-verified entry that replays the action log
  on the server (DESIGN.md's "Arcade backend"). Hand mode (`use-hand-run.ts`, `hand-pad.tsx`) and
  the phone play sheet (`play-sheet.tsx`) are in the same section.
- Failover: `src/components/game/failover/`, a TypeScript port of Server Survival (MIT): a pure
  fixed-tick sim in `sim/`, a three.js view in `scene/` that only reads it, and a React HUD in
  `ui/`. Its Daily Incident ranks on the arcade board through a proof-verified entry that replays
  the action log on the server (`src/lib/arcade/failover-verify.ts`, `SHADOW` still on). See
  DESIGN.md's "Failover" section and its register entries.
- AI chat: CopilotKit + OpenRouter, proxied through `src/app/api/copilotkit/route.ts`.

## Hard boundaries

- **Never point code or tests at the live database.** Leaderboards and leads live in Postgres
  (prod's `db-data` volume); never run destructive SQL against it casually. Unit tests never touch
  a real database — each store's test does `vi.mock("@/lib/db")` so `getPool()` returns an
  in-memory fake. The single exception is `src/lib/arcade/__tests__/store.db.test.ts`, which runs
  only in CI's `db-integration` job (or against a throwaway local container, see RUNBOOK.md)
  against a service-container Postgres. It refuses any host but `localhost`/`127.0.0.1` and any
  database but `arcade_it`, never reads `DATABASE_URL`, and must never be pointed at prod.
- **Never weaken, disable, or except a gate.** No file-level eslint-disables, no downgrading a
  rule to `"warn"`, no widening `FS_ALLOWLIST` without a justifying comment. Conventions and the
  disable-comment convention are in DESIGN.md.
- **Persistence changes need pinning tests FIRST**, before the behavior change — the mocked-pool
  test harness (`vi.mock("@/lib/db")` in each store's test) makes this cheap.
- **No emojis** anywhere — code, commits, docs, comments.
- **No drive-by refactors.** Note an adjacent problem instead of fixing it in the same change.
- **Push to `main` is not deploy.** Nothing auto-deploys here; see RUNBOOK.md's Deploy section
  before assuming a merged change is live.
