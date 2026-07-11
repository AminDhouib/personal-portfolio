import { z } from "zod";

// Empty string counts as "unset": copying .env.example verbatim leaves `FOO=`
// lines, which reach here as "" and must not trip the URL format checks.
function emptyToUndefined(value: unknown): unknown {
  return value === "" ? undefined : value;
}

// Every key is OPTIONAL at import time — this module is loaded during
// `next build` (CI, fork PRs) where secrets are absent, so the import-time
// schema enforces FORMAT only, never presence. PRESENCE is enforced at
// server boot by validateRequiredEnv() below (called from
// src/instrumentation.ts), which is the strict gate.
const schema = z.object({
  GITHUB_TOKEN: z.string().optional(),
  GA4_SERVICE_ACCOUNT_KEY: z.string().optional(),
  GA4_PROPERTY_SHORTY: z.string().optional(),
  GA4_PROPERTY_UNOTES: z.string().optional(),
  GA4_PROPERTY_CARAMEL: z.string().optional(),
  GA4_PROPERTY_UPUP: z.string().optional(),
  GA4_PROPERTY_GETITDONE: z.string().optional(),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.preprocess(emptyToUndefined, z.url().optional()),
  RESEND_API_KEY: z.string().optional(),
  RESEND_BASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  OPENROUTER_KEY: z.string().optional(),
  DATA_DIR: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  SENTRY_DSN: z.preprocess(emptyToUndefined, z.url().optional()),
});

export type Env = z.infer<typeof schema>;

// Eager format validation. An ABSENT var can never fail (everything is
// optional), but a var that is set to a malformed value — say a non-URL
// SENTRY_DSN — throws here, at boot/build, instead of surfacing as a mystery
// at request time.
schema.parse(process.env);

// Reads go through a Proxy straight to process.env at access time, so tests
// that mutate process.env after module load see the new values without
// mocking. Deliberate trade-off: the parsed zod output above is DISCARDED,
// so a .transform()/.default() added to the schema would be silently
// ignored — keep the schema format-checks-only.
//
// NEXT_PUBLIC_* caveat: this proxy is server-side only. Next.js inlines
// client-side env reads only for static `process.env.NEXT_PUBLIC_*` member
// expressions; the proxy's dynamic `process.env[prop]` is never inlined, so
// a client component reading env.NEXT_PUBLIC_* gets undefined at runtime.
// Client code needs the literal static read — or a committed constant, like
// the Sentry DSN in instrumentation-client.ts.
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return process.env[prop];
  },
});

// Every integration this site depends on. The server refuses to boot when any
// of these is unset — a missing key must be a loud failure at startup, never
// a feature that silently goes dark in production (pass-2 audit RC-P2-3).
// DATA_DIR is deliberately NOT here: it is a path override with a safe
// default of <cwd>/.data (the one sanctioned exception — DESIGN.md register).
export const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "OPENROUTER_KEY",
  "SENTRY_DSN",
  "RESEND_API_KEY",
  "RESEND_BASE_URL",
  "POSTHOG_KEY",
  "POSTHOG_HOST",
  "GITHUB_TOKEN",
  "GA4_SERVICE_ACCOUNT_KEY",
  "GA4_PROPERTY_SHORTY",
  "GA4_PROPERTY_UNOTES",
  "GA4_PROPERTY_CARAMEL",
  "GA4_PROPERTY_UPUP",
  "GA4_PROPERTY_GETITDONE",
] as const;

// The ONLY bypass is this exact name=value pair. It is long and unpleasant on
// purpose: booting without required env is a decision someone must own, not a
// `SKIP_ENV=1` reflex. Simple boolean-ish values ("true", "1", "yes") are
// rejected — see validateRequiredEnv.
export const ENV_BYPASS_VAR = "DANGEROUSLY_BOOT_WITH_MISSING_REQUIRED_ENV_AND_SKIP_VALIDATION";
export const ENV_BYPASS_VALUE =
  "I_UNDERSTAND_THIS_MAY_CRASH_CORRUPT_DATA_OR_EXPOSE_BROKEN_BEHAVIOR";

/**
 * Strict presence gate, called from instrumentation register() at server boot
 * (dev and prod). Throws listing the EXACT missing variable names. Empty
 * string counts as missing, matching the import-time format schema.
 *
 * Never runs during `next build` (the caller gates on NEXT_PHASE), so CI and
 * fork PRs build without secrets; the running server is what must be honest.
 */
export function validateRequiredEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((name) => {
    const value = process.env[name];
    return value === undefined || value === "";
  });
  if (missing.length === 0) return;

  const bypass = process.env[ENV_BYPASS_VAR];
  if (bypass === ENV_BYPASS_VALUE) {
    // eslint-disable-next-line no-console -- must print before Sentry is initialized
    console.warn(
      `[env] DANGER: booting WITHOUT required env (bypass sentinel set): missing ${missing.join(", ")}. ` +
        "Features backed by these variables are broken until they are provided.",
    );
    return;
  }

  const lines = [
    `Missing required environment variable(s): ${missing.join(", ")}.`,
    "Set them in .env.local (dev) or the Dokploy application environment (prod).",
    "See .env.example for what each one is and how to obtain it.",
  ];
  if (bypass !== undefined) {
    // An exact-match sentinel is the only accepted bypass; "true"/"1"/a
    // trailing space must fail so the bypass can never happen by accident.
    lines.push(
      `${ENV_BYPASS_VAR} is set but its value is not the exact required sentinel, so it was ignored.`,
    );
  }
  throw new Error(lines.join("\n"));
}
