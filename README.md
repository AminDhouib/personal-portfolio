# Amin Dhouib — Personal Portfolio

Source for [amindhou.com](https://amindhou.com): work case studies, an MDX blog, five browser games with persistent leaderboards, an AI chat assistant, and live GitHub/GA4 stats.

## Stack

- [Next.js 16](https://nextjs.org) App Router with Turbopack, [React 19](https://react.dev), TypeScript (strict mode)
- Tailwind CSS v4
- [CopilotKit](https://www.copilotkit.ai/) + [OpenRouter](https://openrouter.ai/) for the AI chat assistant
- three.js / React Three Fiber for the browser games
- MDX (`next-mdx-remote`) for the blog
- Vitest + Testing Library for tests
- pnpm, managed via Corepack

## Getting started

Requires Node.js >= 22 (see `.nvmrc` / the `engines` field in `package.json`) and Docker — `pnpm
dev` runs the app in Docker Compose alongside its Postgres database.

```bash
corepack enable
pnpm install
cp -n .env.example .env   # Compose reads .env; fill in POSTGRES_PASSWORD + the required vars
pnpm dev
```

`pnpm dev` runs `docker compose up --build`: it brings up Postgres (the `db` service) and the app
together, waits for the database healthcheck, then runs a production build in a container (no
Turbopack hot reload). No host port is published by default — see RUNBOOK.md for local browser
access and the bare `next dev` escape hatch for fast iteration.

A local `.env` is required, not optional: at minimum `POSTGRES_PASSWORD` plus every variable the
boot gate marks REQUIRED, since the server (`src/env.ts` `validateRequiredEnv`) refuses to start
without them — in dev too. See the comments in `.env.example` for what each variable is, how to
obtain it, and the one emergency bypass.

## Scripts

| Script               | Description                                         |
| -------------------- | --------------------------------------------------- |
| `pnpm dev`           | Build and run the app + Postgres via Docker Compose |
| `pnpm build`         | Production build (`next build`)                     |
| `pnpm start`         | Run the app + Postgres via Docker Compose, detached |
| `pnpm lint`          | ESLint                                              |
| `pnpm typecheck`     | Type-check with `tsc --noEmit`                      |
| `pnpm format`        | Format the codebase with Prettier                   |
| `pnpm format:check`  | Check formatting without writing changes            |
| `pnpm test`          | Run the test suite once                             |
| `pnpm test:watch`    | Run tests in watch mode                             |
| `pnpm test:coverage` | Run the test suite once with coverage               |

## Project structure

```
src/
  app/          Next.js App Router routes: pages + API routes (chat, leaderboards, leads)
  components/   React components (blog, chat, games, layout, sections, three, ui)
  data/         Static app data (e.g. Password Game 2 feed data: wordle, chess, capitals)
  lib/          Server-side utilities: GitHub stats, GA4, blog loader, leaderboard store
  test/         Vitest setup
content/
  blog/         MDX blog posts
```

## Testing

```bash
pnpm test        # vitest run, single pass
pnpm test:watch  # vitest, watch mode
```

Tests use Vitest with `@testing-library/react` and jsdom.

## Deployment

The site is self-hosted via [Dokploy](https://dokploy.com/) (Docker) on a home server, built from the repo's `Dockerfile` — a multi-stage build (`deps` → `builder` → `runner`) producing a Next.js `standalone` output that runs as a non-root user.

**Persistent data.** Game leaderboards, the Password Game 2 leaderboard, and contact-form leads are stored in Postgres, not on disk. Compose defines a `db` service (`postgres:17-alpine`) whose data lives on the `db-data` named volume; the schema is created once, on the volume's first start, from `db/init.sql`. Without that volume the data would be wiped on every redeploy. See RUNBOOK.md's data section for the table list and the schema-change procedure.

**CI/CD.** `.github/workflows/ci.yml` runs on every push and pull request:

1. `quality` job — install, typecheck, lint, test, build.
2. `deploy` job — runs only on push to `main`, and only after `quality` passes. It checks for four repository secrets (`TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`, `DOKPLOY_URL`, `DOKPLOY_TOKEN`); if any are missing it prints `deploy skipped: secrets not configured` and exits cleanly. Otherwise it joins the tailnet via `tailscale/github-action` (OAuth client tagged `tag:ci`) and calls the Dokploy API to trigger a deploy.

This exists because Dokploy's built-in GitHub `autoDeploy` webhook **cannot** work here: the Dokploy panel is reachable only over Tailscale, and GitHub's servers can't reach into the tailnet to deliver a webhook. Instead, the GitHub Actions runner joins the tailnet itself and pushes the deploy trigger from inside it.

**Manual deploy fallback**, from a machine on the tailnet:

```bash
curl -sf -X POST "$DOKPLOY_URL/api/application.deploy" \
  -H "x-api-key: $DOKPLOY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"applicationId":"9ZeLiZVLfBtm0OwzIWBxI"}'
```

or use the "Deploy" button in the Dokploy panel directly.

**Verifying a deploy.** Check the deployment list in Dokploy for the new commit hash with status `done` (build takes roughly 45s), then spot-check [amindhou.com](https://amindhou.com).

## Windows dev note

Turbopack previously panicked on an inline SVG data-URI in `globals.css`; the fix was externalizing the image to `public/textures/noise.svg` and referencing it by URL instead. If a dev route ever starts 500ing and a stray `nul` file appears at the repo root, suspect a reintroduced CSS data-URI as the cause.
