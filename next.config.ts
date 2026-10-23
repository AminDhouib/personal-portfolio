import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
// Relative, not the `@/` alias: Next's own config loader reads this file before any tsconfig
// path mapping is in play.
import { posthogProxyHeaders, posthogProxyRewrites } from "./src/lib/posthog-proxy";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.simpleicons.org",
      },
      {
        protocol: "https",
        hostname: "media.contra.com",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "@radix-ui/react-dialog"],
  },
  // Sentry's diagnostics-channel injection hook is loaded at runtime from a path the file tracer
  // copies as an asset, so the standalone output gets build/esm/hook.js without the vendored files
  // it imports, and boot logs "Failed to register diagnostics-channel injection hooks" (no pg or AI
  // spans). Upstream: getsentry/sentry-javascript#25480 (the includes workaround); drop this whole
  // block once Sentry traces the hook's imports itself. The pnpm store paths are the ones the
  // packages resolve to, with the version wildcarded so a bump keeps matching; withSentryConfig
  // leaves this key alone. Everything here is the hook's ESM import closure:
  // server-runtime-injection is the hook itself, @sentry/core is imported by its debug.js and
  // hook.js, @sentry/server-utils supplies the orchestrion instrumentation config, and
  // @sentry/conventions is the attribute names @sentry/core imports.
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/.pnpm/@sentry+server-runtime-injection@*/node_modules/@sentry/server-runtime-injection/build/esm/**/*.js",
      "./node_modules/.pnpm/@sentry+server-runtime-injection@*/node_modules/@sentry/server-runtime-injection/build/esm/package.json",
      "./node_modules/.pnpm/@sentry+core@*/node_modules/@sentry/core/build/esm/**/*.js",
      "./node_modules/.pnpm/@sentry+core@*/node_modules/@sentry/core/build/esm/package.json",
      "./node_modules/.pnpm/@sentry+server-utils@*/node_modules/@sentry/server-utils/build/esm/orchestrion/config/*.js",
      "./node_modules/.pnpm/@sentry+server-utils@*/node_modules/@sentry/server-utils/build/esm/package.json",
      "./node_modules/.pnpm/@sentry+conventions@*/node_modules/@sentry/conventions/dist/{index,attributes,op}.mjs",
    ],
  },
  // First-party PostHog path: the browser SDK posts to a same-origin path and these rules
  // forward it to PostHog, so an ad blocker has no third-party host to match. The path and the
  // rules (an allow-list of what the SDK calls, not a catch-all) live in
  // src/lib/posthog-proxy.ts; src/proxy.ts handles the capture hop.
  // `skipTrailingSlashRedirect` is GLOBAL and required: PostHog's `/e/` endpoints are
  // slash-terminated and Next's default 308 would break them. src/proxy.ts re-creates the
  // default (308 to the slashless form) for every path that is not the PostHog path, so pages
  // do not start answering 200 on a trailing-slash duplicate. DESIGN.md has the register entry.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return posthogProxyRewrites(process.env.NEXT_PUBLIC_POSTHOG_HOST);
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // The PostHog proxy path answers with PostHog's responses, not pages: noindex.
      ...posthogProxyHeaders(),
      {
        // Immutable cache for hashed Next.js static assets
        source: "/_next/static/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Long-lived cache for public images/fonts
        source: "/(.*)\\.(jpg|jpeg|png|gif|webp|avif|svg|ico|woff|woff2|ttf|otf)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      {
        // The Super Voltorb Flip music and jingles (1.4 MB loop). Plain files in public/ with
        // stable names, so no `immutable`: a replaced recording reaches returning visitors within about a
        // month (30 days fresh, then up to a week of background revalidation).
        source: "/games/super-voltorb-flip/audio/(.*)\\.mp3",
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
};

// Sourcemap upload is gated on SENTRY_AUTH_TOKEN: without a token the Sentry
// bundler plugin cannot authenticate to sentry.devino.ca, so uploading is
// pointless. When the token is set, org/project/URL come from SENTRY_ORG /
// SENTRY_PROJECT / SENTRY_URL (self-hosted) — set all of them together in the
// build environment.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

if (!sentryAuthToken) {
  console.warn(
    "[sentry] sourcemap upload disabled: SENTRY_AUTH_TOKEN not set -- prod stack traces will be minified",
  );
}

export default withSentryConfig(nextConfig, {
  silent: true,
  authToken: sentryAuthToken,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  sourcemaps: { disable: !sentryAuthToken },
});
