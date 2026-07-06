import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { logWarn } from "@/lib/log";
import { safeJsonParse } from "@/lib/safe-json";

// Property IDs for each app (set in .env.local)
const propertyIds: Record<string, string | undefined> = {
  shorty: process.env.GA4_PROPERTY_SHORTY,
  unotes: process.env.GA4_PROPERTY_UNOTES,
  caramel: process.env.GA4_PROPERTY_CARAMEL,
  upup: process.env.GA4_PROPERTY_UPUP,
  getitdone: process.env.GA4_PROPERTY_GETITDONE,
};

// Client-side timeout for GA4 Data API calls so a slow/hung upstream request
// can't stall ISR regeneration.
const GA4_TIMEOUT_MS = 8000;

let _client: BetaAnalyticsDataClient | null = null;

function getClient(): BetaAnalyticsDataClient | null {
  const keyJson = process.env.GA4_SERVICE_ACCOUNT_KEY;
  if (!keyJson) return null;
  if (_client) return _client;
  const credentials = safeJsonParse<{ client_email: string; private_key: string }>(keyJson, "ga4");
  if (!credentials) return null;
  try {
    _client = new BetaAnalyticsDataClient({ credentials });
    return _client;
  } catch (err) {
    logWarn("ga4", "failed to init BetaAnalyticsDataClient", err);
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
    logWarn("ga4", `runReport activeUsers failed for slug "${slug}" (property ${propertyId})`, err);
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
