import { NextResponse } from "next/server";
import { WORDLE_WORDS, wordleOfTheDay } from "../../../../data/password-game/wordle";

export const runtime = "nodejs";

/**
 * Server-side proxy for today's Wordle answer.
 *
 * Pulls from NYT's published daily endpoint and caches the response for 12
 * hours via Next's fetch cache — all clients hit our cache, we hit NYT at
 * most twice a day. Falls back to our deterministic static pool if the
 * upstream is unreachable or returns garbage.
 */

interface NytWordle {
  id?: number;
  solution?: string;
  print_date?: string;
}

function todayUtcIso(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchNyt(dateIso: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.nytimes.com/svc/wordle/v2/${dateIso}.json`,
      {
        headers: { "User-Agent": "password-game-portfolio/1.0" },
        next: { revalidate: 60 * 60 * 12 },
      }
    );
    if (!res.ok) return null;
    const data: NytWordle = await res.json();
    const raw = data.solution;
    if (typeof raw !== "string") return null;
    const word = raw.toUpperCase();
    if (!/^[A-Z]{5}$/.test(word)) return null;
    return word;
  } catch {
    return null;
  }
}

export async function GET() {
  const dateIso = todayUtcIso();
  const remote = await fetchNyt(dateIso);
  if (remote) {
    return NextResponse.json(
      { word: remote, source: "nyt", date: dateIso },
      { headers: { "cache-control": "public, s-maxage=43200, stale-while-revalidate=86400" } }
    );
  }
  // Fallback: deterministic pick from our static pool so the game keeps working.
  const fallback = wordleOfTheDay();
  return NextResponse.json(
    { word: fallback, source: "fallback", date: dateIso, poolSize: WORDLE_WORDS.length },
    { headers: { "cache-control": "public, s-maxage=3600" } }
  );
}
