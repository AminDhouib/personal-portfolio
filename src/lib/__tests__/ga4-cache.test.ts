import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Configured-property path of src/lib/ga4.ts (ga4.test.ts covers the
// unconfigured one). GA4 itself, the Next data cache and Sentry reporting are
// replaced with in-memory fakes; propertyIds is captured at module load, so
// the module is imported fresh after the env is stubbed.

const runReport = vi.fn();
const captureException = vi.fn();
const cacheOptions: Array<{ keyParts: string[]; options: unknown }> = [];

vi.mock("@google-analytics/data", () => ({
  BetaAnalyticsDataClient: vi.fn(function () {
    return { runReport };
  }),
}));

vi.mock("@/lib/log", () => ({ captureException }));

// Stand-in for Next's data cache with the two properties the fix relies on:
// one entry per argument list, and a rejected call is never stored.
vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: string[]) => Promise<unknown>,
    keyParts: string[],
    options: unknown,
  ) => {
    cacheOptions.push({ keyParts, options });
    const store = new Map<string, unknown>();
    return async (...args: string[]) => {
      const key = JSON.stringify(args);
      if (store.has(key)) return store.get(key);
      const value = await fn(...args);
      store.set(key, value);
      return value;
    };
  },
}));

function reportWith(value: string) {
  return [{ rows: [{ metricValues: [{ value }] }] }];
}

async function loadGa4() {
  vi.resetModules();
  cacheOptions.length = 0;
  return import("../ga4");
}

describe("fetchMAU with GA4 configured", () => {
  beforeEach(() => {
    vi.stubEnv(
      "GA4_SERVICE_ACCOUNT_KEY",
      JSON.stringify({ client_email: "a@b.c", private_key: "k" }),
    );
    vi.stubEnv("GA4_PROPERTY_UNOTES", "111");
    vi.stubEnv("GA4_PROPERTY_SHORTY", "222");
    runReport.mockReset();
    captureException.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("caches the reading for a day under a shared ga4-mau tag", async () => {
    await loadGa4();
    expect(cacheOptions).toEqual([
      { keyParts: ["ga4-active-users-30d"], options: { revalidate: 86400, tags: ["ga4-mau"] } },
    ]);
  });

  it("gives every caller of the same product one GA4 reading", async () => {
    const { fetchMAU, fetchAllMAU } = await loadGa4();
    runReport.mockResolvedValue(reportWith("192100"));

    const detailPage = await fetchMAU("unotes");
    const homePage = await fetchAllMAU();

    expect(detailPage).toBe(192100);
    expect(homePage.unotes).toBe(192100);
    const unotesCalls = runReport.mock.calls.filter(
      ([req]) => (req as { property: string }).property === "properties/111",
    );
    expect(unotesCalls).toHaveLength(1);
  });

  it("reports a failed call, returns null, and retries it next time instead of caching it", async () => {
    const { fetchMAU } = await loadGa4();
    runReport.mockRejectedValueOnce(new Error("GA4 down"));
    runReport.mockResolvedValueOnce(reportWith("27000"));

    expect(await fetchMAU("shorty")).toBeNull();
    expect(captureException).toHaveBeenCalledWith("ga4.fetchMAU", expect.any(Error));

    expect(await fetchMAU("shorty")).toBe(27000);
    expect(runReport).toHaveBeenCalledTimes(2);
  });
});
