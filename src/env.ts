import { z } from "zod";

// Empty string counts as "unset": copying .env.example verbatim leaves `FOO=`
// lines, which reach here as "" and must not trip the URL format checks.
function emptyToUndefined(value: unknown): unknown {
  return value === "" ? undefined : value;
}

// Every key is intentionally optional — each integration degrades gracefully
// when its variable is missing (.env.example documents the per-key fallback).
// The schema therefore enforces FORMAT only, never presence.
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
  OPENROUTER_KEY: z.string().optional(),
  LEADS_DATA_DIR: z.string().optional(),
  LEADERBOARD_DATA_DIR: z.string().optional(),
  PG_LEADERBOARD_DIR: z.string().optional(),
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
