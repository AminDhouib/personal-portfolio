import { safeJsonParse } from "@/lib/safe-json";
import { safeSessionSet } from "@/lib/safe-storage";

/**
 * How the visitor reached the site, captured once on the first page of the visit.
 * Read when a lead is saved (src/lib/lead-analytics.ts) so the lead_submitted event can say
 * where that person came from.
 *
 * Why this module and not posthog-js's own persisted values: PostHog's initial-referrer and
 * initial-UTM properties are person properties set once for the browser, so they describe the
 * FIRST visit ever, not this one, and the persistence behind them is internal to the SDK (no
 * public getter in 1.399). Its per-session entry properties ($session_entry_*) are only
 * attached to outgoing events, never readable. Recording the first page ourselves, in
 * sessionStorage, gives the visit's own values through a documented browser API, and the same
 * code is unit-testable with no PostHog at all.
 */
export interface VisitAttribution {
  /** utm_source, or "" when the landing URL had none. */
  source: string;
  /** utm_medium, or "". */
  medium: string;
  /** utm_campaign, or "". */
  campaign: string;
  /** The referring page as origin plus path (no query string), or "" when direct or internal. */
  referrer: string;
  /** The referring page's hostname, or "". */
  referring_domain: string;
  /** Path of the first page of the visit, without query string or hash. */
  landing_page: string;
}

export const EMPTY_VISIT_ATTRIBUTION: VisitAttribution = {
  source: "",
  medium: "",
  campaign: "",
  referrer: "",
  referring_domain: "",
  landing_page: "",
};

const KEY = "visit:attribution:v1";
const VALUE_MAX = 100;
const URL_MAX = 300;

let memory: VisitAttribution | null = null;

function clip(value: string | null | undefined, max = VALUE_MAX): string {
  return (value ?? "").trim().slice(0, max);
}

/** Host without a leading "www.", so www.amindhou.com and amindhou.com compare equal. */
function bareHost(host: string): string {
  return host.replace(/^www\./, "");
}

/** URL.origin is the string "null" for schemes like android-app://; rebuild it from parts. */
function originOf(url: URL): string {
  return url.origin === "null" ? `${url.protocol}//${url.host}` : url.origin;
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    // silent-ok: an unparseable URL or referrer is external input; the empty attribution is the honest value
    return null;
  }
}

/** Pure: the attribution for a landing URL and the document.referrer that came with it. */
export function parseVisitAttribution(href: string, referrer: string): VisitAttribution {
  const landing = parseUrl(href);
  if (!landing) return { ...EMPTY_VISIT_ATTRIBUTION };

  const from = referrer ? parseUrl(referrer) : null;
  // A referrer from the site itself (a link opened in a new tab) says nothing about how the
  // visitor found it.
  const external = from && bareHost(from.host) !== bareHost(landing.host) ? from : null;

  return {
    source: clip(landing.searchParams.get("utm_source")),
    medium: clip(landing.searchParams.get("utm_medium")),
    campaign: clip(landing.searchParams.get("utm_campaign")),
    referrer: external ? clip(originOf(external) + external.pathname, URL_MAX) : "",
    referring_domain: external ? clip(external.hostname) : "",
    landing_page: clip(landing.pathname, URL_MAX),
  };
}

function isAttribution(x: unknown): x is VisitAttribution {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return Object.keys(EMPTY_VISIT_ATTRIBUTION).every((k) => typeof o[k] === "string");
}

function readStored(): VisitAttribution | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(KEY);
  } catch {
    // silent-ok: storage can be blocked; the in-memory copy covers the page's lifetime
    return null;
  }
  if (raw === null) return null;
  const parsed = safeJsonParse<unknown>(raw, "visit-attribution");
  return isAttribution(parsed) ? parsed : null;
}

/**
 * Records the first page of the visit; later calls in the same tab session keep it.
 * Call from the root layout on mount, so the first page is the one that is read.
 */
export function recordVisitAttribution(): void {
  if (typeof window === "undefined") return;
  if (memory ?? readStored()) return;
  memory = parseVisitAttribution(window.location.href, document.referrer);
  safeSessionSet(KEY, JSON.stringify(memory));
}

/** The visit's first-touch attribution, or all-empty when nothing was recorded. */
export function getVisitAttribution(): VisitAttribution {
  if (typeof window === "undefined") return { ...EMPTY_VISIT_ATTRIBUTION };
  return memory ?? readStored() ?? { ...EMPTY_VISIT_ATTRIBUTION };
}

/** Test seam: forget the in-memory copy (a hard reload does this in a browser). */
export function resetVisitAttributionForTests(): void {
  memory = null;
}
