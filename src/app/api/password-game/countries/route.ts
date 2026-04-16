import { NextResponse } from "next/server";

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
    const res = await fetch(
      "https://restcountries.com/v3.1/all?fields=name,capital",
      {
        headers: { "User-Agent": "password-game-portfolio/1.0" },
        next: { revalidate: 60 * 60 * 24 * 7 },
      }
    );
    if (!res.ok) return [];
    const data: RestCountry[] = await res.json();
    if (!Array.isArray(data)) return [];
    const out: CountryCapital[] = [];
    for (const c of data) {
      const country = c.name?.common;
      const capital = c.capital?.[0];
      if (
        typeof country === "string" && country.length > 0 &&
        typeof capital === "string" && capital.length > 0
      ) {
        out.push({ country, capital });
      }
    }
    out.sort((a, b) => a.country.localeCompare(b.country));
    return out;
  } catch {
    return [];
  }
}

export async function GET() {
  const capitals = await fetchAll();
  return NextResponse.json(
    {
      capitals,
      count: capitals.length,
      source: capitals.length > 0 ? "restcountries" : "unavailable",
    },
    {
      headers: {
        "cache-control": "public, s-maxage=604800, stale-while-revalidate=86400",
      },
    }
  );
}
