# T-6400 PORTFOLIO-Q (InvariantError "Expected RSC response, got text/plain"), triage evidence

This is triage evidence, not a prod probe. Nothing was sent to amindhou.com.

Verdict (verdict.md): scanner noise. 4 events in 5 days, 0 users, all unauthenticated POSTs (POST /app rendered as /_not-found, and one POST /?_rsc=...), a 3-second burst on 2026-10-21 14:56Z, one event tagged crawler, no deploy nearby, and the app has no server actions.

PORTFOLIO-Q was set to ignored-until-escalating at about 14:15Z. sentry-q-ignored.png is a headed screenshot of the issue in self-hosted Sentry showing the status banner, which this Sentry version labels "Archived - Archived until it escalates" (its current name for ignored-until-escalating), and the activity comment with the T-6400 triage note.

No code change. The fallback, if it ever escalates, is a POST-only beforeSend filter in src/instrumentation.ts.
