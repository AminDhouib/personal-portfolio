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

Requires Node.js >= 22 (see `.nvmrc` / the `engines` field in `package.json`).

```bash
corepack enable
pnpm install
cp -n .env.example .env.local   # optional, see below — -n skips the copy if .env.local exists
pnpm dev
```

`pnpm dev` binds the next free port if 3000 is already taken on your machine (Turbopack prints
`⚠ Port 3000 is in use ..., using available port XXXX instead`) — read the terminal output for
the actual URL rather than assuming `localhost:3000`. If you instead see `Another next dev server
is already running`, a previous `next dev` process is still holding a lock; stop that process
before starting a new one. A `Warning: Custom Cache-Control headers detected for the following
routes` notice on startup is also expected — this repo sets custom cache headers on purpose; it
isn't a misconfiguration.

Everything in `.env.example` is optional for local dev: each integration (AI chat, GitHub stats, GA4, lead emails) degrades gracefully — falling back to public/unauthenticated data or simply going quiet — when its variable is unset. See the comments in `.env.example` for the exact fallback behavior of each one.

## Scripts

| Script               | Description                                                  |
| -------------------- | ------------------------------------------------------------ |
| `pnpm dev`           | Start the dev server (Turbopack)                             |
| `pnpm build`         | Production build                                             |
| `pnpm start`         | Serve the production build                                   |
| `pnpm lint`          | ESLint                                                       |
| `pnpm typecheck`     | Type-check with `tsc --noEmit`                               |
| `pnpm format`        | Format the codebase with Prettier                            |
| `pnpm format:check`  | Check formatting without writing changes                     |
| `pnpm test`          | Run the test suite once                                      |
| `pnpm test:watch`    | Run tests in watch mode                                      |
| `pnpm test:coverage` | Run the test suite once with coverage                        |
| `pnpm validate:data` | Validate the shape of the persisted `.data` JSON/JSONL files |

## Project structure

```
src/
  app/          Next.js App Router routes: pages + API routes (chat, leaderboards, leads)
  components/   React components (blog, chat, games, layout, sections, three, ui)
  data/         Static app data (e.g. password-game content)
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

**Persistent data.** Game leaderboards and contact-form leads are written as plain JSON/JSONL files under `/app/.data` inside the container. In production this path is a named Docker volume, `portfolio-data`, mounted onto the Dokploy application — without it, that data is wiped on every redeploy since the container filesystem is otherwise ephemeral.

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
