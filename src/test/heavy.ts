/**
 * Timeout for tests that are CPU-bound by design, not slow by accident (T-6247).
 *
 * vitest's 5 s default is sized for unit tests. These render a whole game in jsdom and drive it
 * through a full round, or re-simulate a 15 minute run: 1 to 2 s on an idle machine, about 3x that
 * under coverage instrumentation, and CI runs coverage on a shared runner beside hundreds of other
 * test files, so the default gave them no headroom (they failed in turn, never the same set twice).
 * Their cost was profiled (--cpu-prof): jsdom and its selector engine, React rendering and the sim
 * itself, not waiting. Where the cost was avoidable (testing-library role scans over the board) it
 * was removed instead, see first-button.ts. 60 s (the value failover-verify.test.ts already used) is about 4x the worst
 * coverage-under-load time measured at twice the host's cores busy; a test that hangs still fails,
 * just later.
 *
 * It is also the right size for a verifier `deadline` a test passes in: the server's replay budget
 * is a wall-clock instant, so a deadline of a few seconds makes a slow host refuse a proof that is
 * valid (controller-daily failed that way under load: ok:false, not a timeout). A test that is
 * not about the deadline gives it this much, so it can only fail by its own timeout.
 *
 * Use it from the files that need it: `vi.setConfig({ testTimeout: CPU_BOUND_TEST_TIMEOUT_MS })`,
 * or as the third argument of a single `it`. Do not raise the global timeout: a slow test that is
 * not CPU-bound should fail at 5 s.
 */
export const CPU_BOUND_TEST_TIMEOUT_MS = 60_000;
