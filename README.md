# T-6351 evidence: green CI with the full vitest suite and no timeout failures

- Run: https://github.com/AminDhouib/personal-portfolio/actions/runs/39768646477 (CI #449, push on main), conclusion success, 11m 51s.
- Sha: c6457e6f290c9caccf1321205fd2d3a64820b217 (fix(rate-limit): keep process-wide buckets out of the eviction set).
- Ancestry: `git merge-base --is-ancestor 61a6b1ba c6457e6f` answers yes after a fetch, so this sha contains
  61a6b1ba and with it #155 (part 1) and #160 (part 2), plus #161 and #162.
- Why not 61a6b1ba's own run: run 39767298018 (61a6b1ba) was cancelled at 11:11:17Z by a newer push (CI cancels superseded
  runs). Its Lighthouse and Deploy jobs were cancelled; no job failed. Run 39768625031 (3261bfbf) was also cancelled.
- Run created 2026-10-22T11:10:56Z, finished about 11:22:47Z. Screenshots taken about 11:30Z (UTC).

## t6351-run-summary.png
CI #449 summary: Success, total duration 11m 51s. All six jobs green in the sidebar and the job graph: Lint, Typecheck, Test
(5m 52s); Build standalone artifact (2m 4s); Lighthouse (11m 22s); Postgres integration (44s); E2E Playwright (3m 38s);
Deploy to Dokploy (4s). Vitest report: 532 test files passed, 6860 tests passed, 1 expected failure, 30 skipped.

## t6351-unit-step-totals.png
The expanded step "Vitest unit + integration tests" (green, 3m 55s) at the end of the test list: every file shows a green check,
then "Test Files 532 passed (532)", "Tests 6860 passed | 1 expected fail | 30 skipped (6891)", Duration 233.79s.
A search of the full job log for "timed out" / "ETIMEDOUT" found 0 matches, so there are no timeout failures.

## t6351-perf-step.png
The step "Vitest performance budgets (run alone)" (green, 5s): `vitest run --project perf` (vitest v4.1.12), the failover
replay-cost.perf.test.ts with 2 tests passed (3309 ms and 697 ms), "Test Files 1 passed (1)", "Tests 2 passed (2)".
Only Vite configLoader warnings appear besides the passing output.
