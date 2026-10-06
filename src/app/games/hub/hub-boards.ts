import { sanitizePlayerName } from "@/lib/player-name";
import { isRecord } from "./guards";
import type { TodaySource } from "./today-sources";

/** One line of a Today tile. `value` is a score (arcade) or a run time in ms (pg2). */
export interface HubRow {
  rank: number;
  name: string;
  value: number;
}

export type HubBoardResult = { status: "ok"; rows: HubRow[] } | { status: "error" };

export const HUB_ROW_LIMIT = 3;
export const HUB_FETCH_TIMEOUT_MS = 5000;

const NAME_MAX = 32;
const FALLBACK_NAME = "Anonymous";
// Mirrors ARCADE_SCORE_CAP in src/lib/arcade/games.ts. That module imports zod and the
// validators, which a client component must not pull in for one number; hub-boards.test.ts
// pins the two together.
const ARCADE_SCORE_CAP = 10_000_000;
// Mirrors TIME_MS_MAX in the PG2 leaderboard route (one hour).
const PG2_TIME_MAX_MS = 3_600_000;

/** The public daily-board read for one source. Never carries a player id. */
export function hubBoardUrl(source: TodaySource): string {
  return source.kind === "pg2"
    ? "/api/password-game-2/leaderboard?daily=1"
    : `/api/arcade/scores?game=${source.slug}&board=daily`;
}

function toRow(rank: number, name: unknown, raw: unknown, max: number): HubRow | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return {
    rank,
    name: sanitizePlayerName(name, { maxLength: NAME_MAX, fallback: FALLBACK_NAME }),
    value: Math.min(max, Math.max(0, Math.floor(raw))),
  };
}

// A guarded parse, not a trust: the body is whatever the network returned. Rows that do
// not fit are skipped, numbers are clamped, and the names stay plain strings that React
// renders as text. Null means the body is not a board at all.
function parseRows(data: unknown, nameKey: string, valueKey: string, max: number): HubRow[] | null {
  if (!isRecord(data) || !Array.isArray(data.entries)) return null;
  const entries: unknown[] = data.entries;
  const rows: HubRow[] = [];
  for (const item of entries) {
    if (rows.length >= HUB_ROW_LIMIT) break;
    if (!isRecord(item)) continue;
    const row = toRow(rows.length + 1, item[nameKey], item[valueKey], max);
    if (row) rows.push(row);
  }
  return rows;
}

/** Top rows of an arcade board response (`{ entries: [{ handle, score, ... }] }`). */
export function parseArcadeRows(data: unknown): HubRow[] | null {
  return parseRows(data, "handle", "score", ARCADE_SCORE_CAP);
}

/** Top rows of a Password Game 2 response (`{ entries: [{ name, timeMs, ... }] }`). */
export function parsePg2Rows(data: unknown): HubRow[] | null {
  return parseRows(data, "name", "timeMs", PG2_TIME_MAX_MS);
}

/**
 * One bounded read. Every failure (non-2xx, 429, a rejected fetch, a timeout, an abort, a
 * body that is not a board) is the same "error" result: the strip shows "Board unavailable
 * right now" and never raises an error report. The request is aborted when `parent` aborts
 * or after HUB_FETCH_TIMEOUT_MS, whichever comes first.
 */
export async function fetchHubBoard(
  source: TodaySource,
  parent?: AbortSignal,
): Promise<HubBoardResult> {
  if (parent?.aborted) return { status: "error" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HUB_FETCH_TIMEOUT_MS);
  const onParentAbort = () => controller.abort();
  parent?.addEventListener("abort", onParentAbort, { once: true });
  try {
    const res = await fetch(hubBoardUrl(source), { signal: controller.signal });
    if (controller.signal.aborted || !res.ok) return { status: "error" };
    const data: unknown = await res.json();
    const rows = source.kind === "pg2" ? parsePg2Rows(data) : parseArcadeRows(data);
    return rows === null ? { status: "error" } : { status: "ok", rows };
  } catch {
    // silent-ok: a failed read is the tile's "Board unavailable" state; a public leaderboard
    // glance must never raise an error report or break the page.
    return { status: "error" };
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
}

/** A run time in milliseconds as m:ss.s, floored to tenths (83456 is "1:23.4"). */
export function formatRunTime(ms: number): string {
  const tenths = Math.floor(ms / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths % 10}`;
}

/** The right-hand value of a tile row: a time for pg2, a score for the arcade games. */
export function formatHubValue(kind: TodaySource["kind"], value: number): string {
  return kind === "pg2" ? formatRunTime(value) : value.toLocaleString("en-US");
}
