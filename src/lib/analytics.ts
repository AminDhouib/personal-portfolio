import posthog from "posthog-js";
import { BOOKING_URL, socialLinks } from "@/data/nav";

// Named conversion events, sent to every analytics sink that is loaded:
// PostHog (instrumentation-client.ts, gated on NEXT_PUBLIC_POSTHOG_KEY) and
// GA4 gtag.js (google-analytics.tsx, gated on NEXT_PUBLIC_GA4_ID). With
// neither configured -- local dev, CI -- track() is a no-op. PostHog
// autocapture already records raw clicks; these names are what funnels and
// GA4 key events are built on.

export type ConversionEvent = "book_call_click" | "email_click" | "social_click" | "chat_open";

type EventProps = Record<string, string>;

type WindowWithGtag = Window & { gtag?: (...args: unknown[]) => void };

export function track(event: ConversionEvent, props: EventProps = {}): void {
  if (typeof window === "undefined") return;
  if (posthog.__loaded) posthog.capture(event, props);
  (window as WindowWithGtag).gtag?.("event", event, props);
}

/** Where on the page a link sits: its section id, else the site chrome it belongs to. */
function placementOf(anchor: Element): string {
  const section = anchor.closest("section[id]");
  if (section) return section.id;
  if (anchor.closest("footer")) return "footer";
  if (anchor.closest("nav, header")) return "navbar";
  return "page";
}

/**
 * Maps a clicked link to the conversion it represents, or null for ordinary
 * navigation. Matching is on the resolved href, so every current and future
 * Book a Call button is covered without wiring each one.
 */
export function conversionForLink(
  anchor: HTMLAnchorElement,
  path: string,
): { event: ConversionEvent; props: EventProps } | null {
  const href = anchor.href;
  const placement = placementOf(anchor);
  if (href.startsWith(BOOKING_URL)) {
    return { event: "book_call_click", props: { placement, path } };
  }
  if (href.startsWith("mailto:")) {
    return { event: "email_click", props: { placement, path } };
  }
  const social = socialLinks.find((link) => href.replace(/\/$/, "") === link.url);
  if (social) {
    return { event: "social_click", props: { network: social.name, placement, path } };
  }
  return null;
}
