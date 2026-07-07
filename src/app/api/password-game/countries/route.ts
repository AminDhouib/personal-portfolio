import { NextResponse } from "next/server";
import { captureException, logWarn } from "@/lib/log";

export const runtime = "nodejs";

/**
 * Server-side proxy for REST Countries — returns the full list of country +
 * capital pairs so the capital-city rule has 200+ options instead of the
 * hand-curated ~35. Cached for a week: country capitals rarely change, and
 * the upstream response is ~200KB.
 *
 * Fallback: empty list. The client will keep using its static pool when the
 * API is unreachable.
 */

interface RestCountry {
  name?: { common?: string };
  capital?: string[];
}

interface CountryCapital {
  country: string;
  capital: string;
}

async function fetchAll(): Promise<CountryCapital[]> {
  try {
    const res = await fetch("https://restcountries.com/v3.1/all?fields=name,capital", {
      headers: { "User-Agent": "password-game-portfolio/1.0" },
      next: { revalidate: 60 * 60 * 24 * 7 },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      logWarn("api:countries", "upstream returned a non-OK status", { status: res.status });
      return [];
    }
    const data: RestCountry[] = await res.json();
    if (!Array.isArray(data)) {
      logWarn("api:countries", "upstream payload was not an array");
      return [];
    }
    const out: CountryCapital[] = [];
    for (const c of data) {
      const country = c.name?.common;
      const capital = c.capital?.[0];
      if (
        typeof country === "string" &&
        country.length > 0 &&
        typeof capital === "string" &&
        capital.length > 0
      ) {
        out.push({ country, capital });
      }
    }
    out.sort((a, b) => a.country.localeCompare(b.country));
    return out;
  } catch (err) {
    captureException("api:countries", err);
    return [];
  }
}

export async function GET() {
  const capitals = await fetchAll();
  // DD3-003: a failure must not be cached like a success — an empty list held
  // for a week is a self-inflicted outage. Mirror chess-puzzle's short TTL so
  // the CDN retries within minutes.
  if (capitals.length === 0) {
    return NextResponse.json(
      { capitals, count: 0, source: "unavailable" },
      { headers: { "cache-control": "public, s-maxage=300" } },
    );
  }
  return NextResponse.json(
    { capitals, count: capitals.length, source: "restcountries" },
    {
      headers: {
        "cache-control": "public, s-maxage=604800, stale-while-revalidate=86400",
      },
    },
  );
}
