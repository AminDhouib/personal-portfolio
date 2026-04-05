import { BetaAnalyticsDataClient } from "@google-analytics/data";

// Property IDs for each app (set in .env.local)
const propertyIds: Record<string, string | undefined> = {
  shorty: process.env.GA4_PROPERTY_SHORTY,
  unotes: process.env.GA4_PROPERTY_UNOTES,
  caramel: process.env.GA4_PROPERTY_CARAMEL,
  upup: process.env.GA4_PROPERTY_UPUP,
  getitdone: process.env.GA4_PROPERTY_GETITDONE,
};

let _client: BetaAnalyticsDataClient | null = null;

function getClient(): BetaAnalyticsDataClient | null {
  const keyJson = process.env.GA4_SERVICE_ACCOUNT_KEY;
  if (!keyJson) return null;
  if (_client) return _client;
  try {
    const credentials = JSON.parse(keyJson) as {
      client_email: string;
      private_key: string;
    };
    _client = new BetaAnalyticsDataClient({ credentials });
    return _client;
  } catch {
    return null;
  }
}

export async function fetchMAU(slug: string): Promise<number | null> {
  const propertyId = propertyIds[slug];
  if (!propertyId) return null;
  const client = getClient();
  if (!client) return null;

  try {
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      metrics: [{ name: "activeUsers" }],
    });
    const value = response.rows?.[0]?.metricValues?.[0]?.value;
    return value ? parseInt(value, 10) : null;
  } catch {
    return null;
  }
}

export async function fetchAllMAU(): Promise<Record<string, number | null>> {
  const slugs = Object.keys(propertyIds);
  const results = await Promise.allSettled(slugs.map((s) => fetchMAU(s)));
  return Object.fromEntries(
    slugs.map((slug, i) => {
      const r = results[i];
      return [slug, r.status === "fulfilled" ? r.value : null];
    })
  );
}
