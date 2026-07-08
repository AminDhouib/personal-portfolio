# Exact version + digest: CI resolves Node from .nvmrc (22.23.1) and this base
# must match it; the digest pins the image content so a re-tagged upstream
# cannot silently change what prod runs. Dependabot does not bump digests in
# Dockerfiles -- update version + digest together when bumping .nvmrc.
FROM node:22.23.1-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS base

# --- Dependencies ---
FROM base AS deps
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- Dev (hot-reload target for compose.override.yml) ---
FROM deps AS dev
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]

# --- Builder ---
FROM base AS builder
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# --- Runner (production) ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
