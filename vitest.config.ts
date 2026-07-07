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
    exclude: [...configDefaults.exclude, "**/.next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      // No `all` option in vitest 4's CoverageOptions -- scope is controlled
      // via include/exclude. Leaving `include` unset keeps the vitest default
      // (only files touched by the suite), i.e. the suite-loaded surface, not
      // a whole-repo scan. Whole-repo coverage is deferred (NF(P7)-c).
      exclude: [
        "**/*.test.{ts,tsx}",
        "src/test/**",
        "**/*.d.ts",
        "*.config.{ts,mjs}",
        "**/types.ts",
      ],
      // Ratcheted floor: floor(measured %) - margin, measured over the
      // richest suite (P1-P7 landed). Margin is 2 for lines/statements/
      // functions and 3 for branches (absorbs run-to-run branch variance
      // from the voltorb randomized-invariant tests -- those tests exercise
      // the same lines/branches regardless of the random values drawn, so
      // only branch coverage can wobble slightly).
      //
      // Ratchet policy: raise the floor in a dedicated commit whenever
      // measured coverage rises. Never lower it except with a stated reason
      // in that commit's message -- lowering the floor silently is a
      // gate-weakening move.
      thresholds: {
        autoUpdate: false,
        lines: 67,
        statements: 63,
        functions: 61,
        branches: 54,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
