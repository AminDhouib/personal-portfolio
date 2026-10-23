import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fetchMAU, fetchAllMAU } from "../ga4";

// GA4_PROPERTY_* env vars are not set in the test environment.
// The propertyIds map is captured at module load time, so all values are undefined.
// fetchMAU hits the `if (!propertyId) return null` guard before any API call.
// No BetaAnalyticsDataClient is ever instantiated — no mocking needed.

describe("fetchMAU", () => {
  it("returns null for an unknown slug", async () => {
    const result = await fetchMAU("not-a-slug");
    expect(result).toBeNull();
  });

  it("returns null when the property env var is not configured", async () => {
    const result = await fetchMAU("shorty");
    expect(result).toBeNull();
  });
});

describe("fetchAllMAU", () => {
  it("returns an object with all expected slug keys", async () => {
    const result = await fetchAllMAU();
    expect(Object.keys(result).sort()).toEqual([
      "caramel",
      "getitdone",
      "shorty",
      "unotes",
      "upup",
    ]);
  });

  it("returns null for all slugs when env vars are not configured", async () => {
    const result = await fetchAllMAU();
    for (const value of Object.values(result)) {
      expect(value).toBeNull();
    }
  });
});

// An unconfigured deployment shows mauFallback on every page, which is
// indistinguishable from a quiet product unless the server says so once.
describe("unconfigured GA4 warning", () => {
  const logWarn = vi.fn();

  // The warn-once memory is module state, so every test loads a fresh copy.
  async function loadGa4() {
    vi.resetModules();
    vi.doMock("@/lib/log", () => ({ logWarn, captureException: vi.fn() }));
    return import("../ga4");
  }

  beforeEach(() => {
    logWarn.mockReset();
    vi.stubEnv("GA4_SERVICE_ACCOUNT_KEY", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/log");
  });

  it("warns exactly once, naming the missing key, however many lookups follow", async () => {
    const { fetchMAU, fetchAllMAU } = await loadGa4();
    await fetchMAU("shorty");
    await fetchMAU("unotes");
    await fetchAllMAU();
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith("ga4", expect.stringContaining("GA4_SERVICE_ACCOUNT_KEY"));
  });

  it("warns once per product when the key is set but that product's property id is not", async () => {
    vi.stubEnv(
      "GA4_SERVICE_ACCOUNT_KEY",
      JSON.stringify({ client_email: "a@b.c", private_key: "k" }),
    );
    const { fetchMAU } = await loadGa4();
    await fetchMAU("shorty");
    await fetchMAU("shorty");
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith("ga4", expect.stringContaining("GA4_PROPERTY_SHORTY"));
  });

  it("does not warn for an unknown slug", async () => {
    const { fetchMAU } = await loadGa4();
    await fetchMAU("not-a-slug");
    expect(logWarn).not.toHaveBeenCalled();
  });

  it("stays silent during next build, where the credentials are never present", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    const { fetchMAU, fetchAllMAU } = await loadGa4();
    await fetchMAU("shorty");
    await fetchAllMAU();
    expect(logWarn).not.toHaveBeenCalled();
  });
});
