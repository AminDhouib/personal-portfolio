# T-6247 evidence: Vitest performance budgets run alone in CI

- Run: https://github.com/AminDhouib/personal-portfolio/actions/runs/39754903283 (CI #431, push on main)
- Commit: d94c735a0dff104ad396a0a9f12c66c8a7794a5e (fix(tests): pin the replay hash, hoist the shared vitest exclude, ...)
- Run created 2026-10-22T09:22:21Z; screenshots taken 2026-10-22 about 10:05Z (UTC).

## t6247-run-summary.png
The run summary for CI #431: status Success, total duration 12m 13s. All six jobs are green in the sidebar and
the job graph: Lint, Typecheck, Test (9m 6s); Build standalone artifact (2m 16s); Lighthouse (12m 5s);
Postgres integration (53s); E2E Playwright (3m 17s); Deploy to Dokploy (3s). The Vitest report shows
531 test files passed, 6748 tests passed, 1 expected failure, 30 skipped.

## t6247-perf-step.png
The Lint, Typecheck, Test job with the step "Vitest performance budgets (run alone)" expanded: green check,
8s. The log runs `pnpm test:perf` (`vitest run --project perf`) and shows
src/components/game/failover/sim/__tests__/replay-cost.perf.test.ts with 2 tests passed
(re-simulates a 15 minute, 40 service, 700 action run within budget, 5407ms; loads a save at the 36,000 tick,
700 action cap within budget, 1161ms), "Test Files 1 passed (1)", "Tests 2 passed (2)".
Only Vite configLoader warnings appear besides the passing output.

## Note
The Deploy to Dokploy job is green but its job page carries a "Deploy skipped" annotation, so this run did not deploy.
