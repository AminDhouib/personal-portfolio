import { NextResponse } from "next/server";
import { STATIC_CAPITALS } from "@/data/password-game/capitals-static";

export const runtime = "nodejs";

/**
 * Serves the vendored country + capital list so the pg2 country-name rule has
 * 200+ options instead of the hand-curated handful.
 *
 * This used to proxy restcountries.com, but that API retired its free v1-v4
 * tiers: every request now returns HTTP 200 with { success: false, data: null }
 * and no payload, and v5 requires an account + Bearer key. We vendor the dataset
 * (src/data/password-game/capitals-static.ts, from mledoze/countries, ODbL)
 * rather than take on a third-party account/secret for a list of capital cities.
 *
 * The route stays (rather than importing the data straight into the client)
 * because pg2's feeds.ts fetches it: serving the list server-side keeps it out
 * of the client bundle. Cached for a week — the list only changes when we
 * regenerate it.
 */
export async function GET() {
  return NextResponse.json(
    { capitals: STATIC_CAPITALS, count: STATIC_CAPITALS.length, source: "static" },
    {
      headers: {
        "cache-control": "public, s-maxage=604800, stale-while-revalidate=86400",
      },
    },
  );
}
