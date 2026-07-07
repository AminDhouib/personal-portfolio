import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
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
      // thresholds are added once the richest suite is measured (see P7 step 4)
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
