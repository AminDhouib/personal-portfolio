import { defineConfig } from "@playwright/test";

// End-to-end suite: drives a real browser against a real production build.
// Nothing is mocked -- pages, sitemap, llms.txt and JSON-LD are whatever the
// server returns. Third-party hosts are blocked per test (e2e/helpers.ts) so a
// run never reaches Google, PostHog or Sentry.
//
// E2E_BASE_URL: the server to test (CI boots the standalone build on :3000).
// E2E_CHANNEL: the installed browser to drive. CI uses Chrome, which ships on
// ubuntu-latest; on Amin's Windows machine Chrome spawning is unreliable, so
// local runs pass E2E_CHANNEL=msedge (see RUNBOOK.md).
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const channel = process.env.E2E_CHANNEL ?? "chrome";
const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [["dot"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    channel,
    trace: "retain-on-failure",
  },
});
