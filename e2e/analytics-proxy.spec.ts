import { expect, test } from "@playwright/test";
import { POSTHOG_PROXY_PATH } from "../src/lib/posthog-proxy";

// The first-party PostHog path and the trailing-slash redirect, read off the running production
// build (next.config.ts rewrites and headers plus src/proxy.ts, which unit tests only see apart).
// Nothing here reaches PostHog: only URLs the app answers itself are requested, so the suite does
// not depend on posthog.devino.ca or on the internal capture hop.

test("a trailing-slash page URL redirects 308 to the slashless form", async ({ request }) => {
  const res = await request.get("/about/", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toBe("/about");
});

test("a trailing-slash redirect keeps the query string", async ({ request }) => {
  const res = await request.get("/about/?utm_source=e2e", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toBe("/about?utm_source=e2e");
});

for (const subPath of ["/login", "/"]) {
  test(`${POSTHOG_PROXY_PATH}${subPath} is not proxied: 404, no redirect`, async ({ request }) => {
    const res = await request.get(`${POSTHOG_PROXY_PATH}${subPath}`, { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    expect(res.headers()["location"]).toBeUndefined();
  });
}

test("a response under the proxy path is marked noindex", async ({ request }) => {
  const res = await request.get(`${POSTHOG_PROXY_PATH}/login`, { maxRedirects: 0 });
  expect(res.status()).toBe(404);
  expect(res.headers()["x-robots-tag"]).toBe("noindex");
});

test("robots.txt keeps crawlers off the proxy path", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text();
  expect(body).toMatch(/^Disallow: \/_p\/$/m);
});
