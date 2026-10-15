"use client";

import posthog from "posthog-js";
import { track } from "@/lib/analytics";
import { getVisitAttribution } from "@/lib/visit-attribution";

export interface SavedLead {
  name: string;
  email: string;
  /** Which chat surface took the lead: the `source` label sent to /api/leads. */
  surface: string;
}

/**
 * The one place a saved lead reaches analytics. Called only after /api/leads accepted the lead.
 *
 * Owner ruling, 2026-10-15: the person handed over their email to be contacted and PostHog is
 * self-hosted, so the lead is identified there by that email and the event carries how the
 * visit started (source, medium, campaign, referrer, landing page). The site has NO consent
 * gate or cookie banner today, so there is nothing to respect yet; a future gate belongs at
 * the top of this function, before anything below runs (see DESIGN.md's register entry).
 *
 * Privacy lines this keeps:
 * - Only PostHog gets the identity. GA4 (Google forbids PII) gets the same event through
 *   track(), with the attribution fields and no email or name.
 * - The visitor's free-text note is not a parameter, so it cannot leak into analytics.
 * - Never throws and never changes the lead flow: an analytics failure is reported and dropped.
 */
export function trackLeadSubmitted(lead: SavedLead): void {
  try {
    const email = lead.email.trim().toLowerCase();
    // identify() before capture, so the event is attributed to the identified person.
    if (email && posthog.__loaded) {
      posthog.identify(email, { email, name: lead.name.trim() });
    }
    const props: Record<string, string> = {
      ...getVisitAttribution(),
      lead_surface: lead.surface,
    };
    // Absent beats blank: an empty UTM field is "no value" in a funnel, not a value of "".
    for (const key of Object.keys(props)) {
      if (!props[key]) delete props[key];
    }
    track("lead_submitted", props);
  } catch (err) {
    // Same guard as arcade/identity.ts: the global is absent outside a browser.
    if (typeof reportError === "function") reportError(err);
  }
}
