/**
 * Timeout for tests that are CPU-bound by design, not slow by accident (T-6247).
 *
 * vitest's 5 s default is sized for unit tests. These render a whole game in jsdom and drive it
 * through a full round, or re-simulate a 15 minute run: 1 to 2 s on an idle machine, about 3x that
 * under coverage instrumentation, and CI runs coverage on a shared runner beside hundreds of other
 * test files, so the default gave them no headroom (they failed in turn, never the same set twice).
 * Their cost was profiled (--cpu-prof): jsdom and its selector engine, React rendering and the sim
 * itself, not waiting. Where the cost was avoidable (testing-library role scans over the board) it
 * was removed instead, see first-button.ts. 30 s is about 6x the worst coverage-under-load time
 * measured; a test that hangs still fails, just later.
 *
 * Use it from the files that need it: `vi.setConfig({ testTimeout: CPU_BOUND_TEST_TIMEOUT_MS })`,
 * or as the third argument of a single `it`. Do not raise the global timeout: a slow test that is
 * not CPU-bound should fail at 5 s.
 */
export const CPU_BOUND_TEST_TIMEOUT_MS = 30_000;
