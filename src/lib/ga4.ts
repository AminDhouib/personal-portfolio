import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { captureException } from "@/lib/log";
import { safeJsonParseServer } from "@/lib/safe-json-server";
import { env } from "@/env";

// Project slug (matches `slug` in src/data/projects.ts) -> that project's GA4
// numeric property ID. IDs come only from GA4_PROPERTY_<SLUG> env vars (see
// src/env), never hard-coded; a slug whose var is unset stays undefined here
// and fetchMAU/fetchAllMAU report null for it instead of throwing.
const propertyIds: Record<string, string | undefined> = {
  shorty: env.GA4_PROPERTY_SHORTY,
  unotes: env.GA4_PROPERTY_UNOTES,
  caramel: env.GA4_PROPERTY_CARAMEL,
  upup: env.GA4_PROPERTY_UPUP,
  getitdone: env.GA4_PROPERTY_GETITDONE,
};

// Client-side timeout for GA4 Data API calls so a slow/hung upstream request
// can't stall ISR regeneration.
const GA4_TIMEOUT_MS = 8000;

let _client: BetaAnalyticsDataClient | null = null;

function getClient(): BetaAnalyticsDataClient | null {
  const keyJson = env.GA4_SERVICE_ACCOUNT_KEY;
  if (!keyJson) return null;
  if (_client) return _client;
  const credentials = safeJsonParseServer<{ client_email: string; private_key: string }>(
    keyJson,
    "ga4",
  );
  if (!credentials) return null;
  try {
    _client = new BetaAnalyticsDataClient({ credentials });
    return _client;
  } catch (err) {
    // Construction failure disables every MAU lookup (all callers then hit the
    // `if (!client) return null` path); surface it instead of degrading silently.
    captureException(
      "ga4.getClient",
      new Error("GA4 client init failed: BetaAnalyticsDataClient constructor threw", {
        cause: err,
      }),
    );
    return null;
  }
}

export async function fetchMAU(slug: string): Promise<number | null> {
  const propertyId = propertyIds[slug];
  if (!propertyId) return null;
  const client = getClient();
  if (!client) return null;

  try {
    const [response] = await client.runReport(
      {
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        metrics: [{ name: "activeUsers" }],
      },
      { timeout: GA4_TIMEOUT_MS },
    );
    const value = response.rows?.[0]?.metricValues?.[0]?.value;
    return value ? parseInt(value, 10) : null;
  } catch (err) {
    // Report the exhausted GA4 call so the null we return (MAU "unavailable")
    // is not mistaken for a legitimately empty metric.
    captureException(
      "ga4.fetchMAU",
      new Error(
        `GA4 runReport(activeUsers) failed for slug "${slug}" (property ${propertyId}); returning null`,
        { cause: err },
      ),
    );
    return null;
  }
}

export async function fetchAllMAU(): Promise<Record<string, number | null>> {
  const slugs = Object.keys(propertyIds);
  const results = await Promise.allSettled(slugs.map((s) => fetchMAU(s)));
  return Object.fromEntries(
    slugs.map((slug, i) => {
      const r = results[i];
      if (!r) return [slug, null];
      if (r.status === "fulfilled") return [slug, r.value];
      return [slug, null];
    }),
  );
}
