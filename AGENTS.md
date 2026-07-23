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
- `content/blog/` — MDX blog posts, loaded via `src/lib/blog.ts`.
- Persistence is Postgres (the compose `db` service): `src/lib/db.ts` hands out a shared `pg`
  pool via `getPool()`; the leaderboard routes, Password Game 2's leaderboard, and
  `leads-store.ts` read and write tables created by `db/init.sql` (run once on the db volume's
  first start). Row shapes are pinned by zod in `persistence-schemas.ts` — see RUNBOOK.md's Data
  section.
- AI chat: CopilotKit + OpenRouter, proxied through `src/app/api/copilotkit/route.ts`.

## Hard boundaries

- **Never point code or tests at the live database.** Leaderboards and leads live in Postgres
  (prod's `db-data` volume); never run destructive SQL against it casually. Tests never touch a
  real database — each store's test does `vi.mock("@/lib/db")` so `getPool()` returns an
  in-memory fake.
- **Never weaken, disable, or except a gate.** No file-level eslint-disables, no downgrading a
  rule to `"warn"`, no widening `FS_ALLOWLIST` without a justifying comment. Conventions and the
  disable-comment convention are in DESIGN.md.
- **Persistence changes need pinning tests FIRST**, before the behavior change — the mocked-pool
  test harness (`vi.mock("@/lib/db")` in each store's test) makes this cheap.
- **No emojis** anywhere — code, commits, docs, comments.
- **No drive-by refactors.** Note an adjacent problem instead of fixing it in the same change.
- **Push to `main` is not deploy.** Nothing auto-deploys here; see RUNBOOK.md's Deploy section
  before assuming a merged change is live.
