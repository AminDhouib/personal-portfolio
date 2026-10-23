# T-6983 evidence: Dependabot majors #185-#189, rebuilt and live

Dependabot could not rebase these PRs, so each one was rebuilt as our own PR on current main. Each got its own remote gate sweep, a review agent, green CI, a rebase merge with the head pinned, and a single deploy (runtime packages only) followed by a headed prod check.

| Package | PR | Main commit | Type | Prod proof |
|---|---|---|---|---|
| @testing-library/jest-dom 7 | #193 | 6852bf96 | dev | none needed |
| jsdom 30 | #194 | b20668b4 | dev | none needed |
| @google-analytics/data 7 | #195 | 0d92b946 | runtime | ga7-* |
| framer-motion 14 | #196 | d0dcca25 | runtime | fm-before-*, fm-after-*, fm-compare-* |
| @sentry/nextjs 11 | #197 | 4e41a261 | runtime | sentry-before-*, sentry-after-* |

- **ga7-\*:** the home Work cards and /work pages render. Prod still shows the fallback figures, a pre-existing issue tracked as T-7002.
- **fm-\*:** the before (framer 12.38) and after (14.6) checks use the same instrumentation:
  - hub banner SVG transforms, with the "+9" pop within 1 px;
  - the mobile menu;
  - the proof-bar count-up;
  - typing-speed bursts;
  - the space-shooter overlays.
  No visual difference.
- **sentry-\*:** with sampling forced, every /monitoring POST returned 200 on both 10.76.2 and 11.9.0. Transactions and replays still flow on 11.9.0. A single controlled self-test event (PORTFOLIO-12, since resolved) carried no user, IP, cookies or body, which confirms the pinned v10 data collection holds.

While capturing the Sentry baseline, a client-side navigation crash turned up. It came from posthog-js 1.438 in #192 and was fixed as T-7017 (#198). Follow-ups: T-7035 (Sentry standalone tracing-hooks gap) and T-7002 (GA4 MAU prerender).
