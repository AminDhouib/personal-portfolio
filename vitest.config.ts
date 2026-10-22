import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // vitest 4's defaultExclude is minimal (node_modules, .git only) -- .next
    // is not covered. A `pnpm build` leaves stale test-file copies under
    // .next/standalone (Next's file tracing pulls in eslint-rules/*.test.mjs
    // and scripts/*.test.mjs); without this, a `pnpm test` run after a build
    // double-counts those files. Spread configDefaults.exclude rather than
    // replacing it -- setting `exclude` bare drops the node_modules/.git
    // exclusions too (vitest 4 behavior, confirmed against installed 4.1.4).
    // .claude/worktrees holds transient agent worktrees (full repo copies);
    // without the exclude their in-progress test files leak into root runs.
    // e2e/ holds the Playwright suites: they need a running server and a real
    // browser, and run through `pnpm test:e2e`, never vitest.
    //
    // *.perf.test.ts hold wall-clock budgets and run only in the "perf" project below.
    exclude: [
      ...configDefaults.exclude,
      "**/.next/**",
      "**/.claude/**",
      "e2e/**",
      "**/*.perf.test.ts",
    ],
    // Two projects. "unit" is every test file, run in parallel (`pnpm test`, `pnpm test:coverage`).
    // "perf" is the files whose assertions are milliseconds on the wall clock: run alone, one
    // worker, after the unit run (`pnpm test:perf`), because a wall-clock budget cannot hold
    // while hundreds of other test files compete for the same cores (T-6247). The scripts name
    // the project, so a bare `vitest run` would run both at once; do not use it for the gate.
    projects: [
      { extends: true, test: { name: "unit" } },
      {
        extends: true,
        test: {
          name: "perf",
          include: ["**/*.perf.test.ts"],
          exclude: [...configDefaults.exclude, "**/.next/**", "**/.claude/**", "e2e/**"],
          fileParallelism: false,
          maxWorkers: 1,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      // HONEST SCOPE (pass-2 audit P2-TEST-001, resolves NF(P7)-c): every
      // source file is in the denominator, tested or not. The previous
      // suite-touched-only default reported 69% while true source coverage
      // was ~23% -- an untested file was invisible to the metric.
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/__tests__/**",
        "src/test/**",
        "**/*.d.ts",
        "*.config.{ts,mjs}",
        "**/types.ts",
      ],
      // Ratcheted floor: floor(measured %) - margin over the full-src scope.
      // Margin is 2 for lines/statements/functions and 3 for branches
      // (absorbs run-to-run branch variance from the voltorb
      // randomized-invariant tests).
      //
      // The floors DROPPED in the pass-2 re-base commit because the
      // denominator became honest, not because coverage regressed -- the
      // measured line count covered went UP in the same change. Ratchet
      // policy is unchanged: raise the floor in a dedicated commit whenever
      // measured coverage rises; never lower it without a stated reason in
      // that commit's message.
      // Re-based 2026-07-31 against measured lines 34.19 / statements 33.40 /
      // functions 33.47 / branches 30.23 -- the suite grew well past the
      // pass-2 floors, which sat ~16 points low. Same formula as before:
      // floor(measured) - margin.
      // Raised again 2026-07-31 against measured lines 36.52 / statements 35.60
      // / functions 37.18 / branches 32.40, after the super-voltorb-flip
      // leak-guard (which renders the real board) and the copilotkit
      // run-error-tap suite landed. Same formula.
      thresholds: {
        autoUpdate: false,
        lines: 34,
        statements: 33,
        functions: 35,
        branches: 29,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
