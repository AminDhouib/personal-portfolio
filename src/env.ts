import { z } from "zod";

const schema = z.object({
  GITHUB_TOKEN: z.string().optional(),
  GA4_SERVICE_ACCOUNT_KEY: z.string().optional(),
  GA4_PROPERTY_SHORTY: z.string().optional(),
  GA4_PROPERTY_UNOTES: z.string().optional(),
  GA4_PROPERTY_CARAMEL: z.string().optional(),
  GA4_PROPERTY_UPUP: z.string().optional(),
  GA4_PROPERTY_GETITDONE: z.string().optional(),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  OPENROUTER_KEY: z.string().optional(),
  LEADS_DATA_DIR: z.string().optional(),
  LEADERBOARD_DATA_DIR: z.string().optional(),
  PG_LEADERBOARD_DIR: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

// Validate eagerly so misconfig crashes at boot, not at request time.
schema.parse(process.env);

// Proxy reads process.env at access time so tests that mutate process.env
// after module load still see the updated values.
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return process.env[prop];
  },
});
