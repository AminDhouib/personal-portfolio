import * as Sentry from "@sentry/nextjs";
import { validateRequiredEnv } from "@/env";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Strict env presence gate (src/env.ts). Enforced on every real server
    // boot (dev + prod); skipped during `next build`, where CI and fork PRs
    // legitimately have no secrets -- `phase-production-build` is that signal.
    // A missing REQUIRED_ENV_VAR fails the boot loudly instead of letting a
    // feature silently go dark in production. Runs before Sentry.init so the
    // bypass sentinel's console.warn lands before any Sentry transport exists.
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      validateRequiredEnv();
    }

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
