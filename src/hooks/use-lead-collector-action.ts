"use client";

import { useCopilotAction } from "@copilotkit/react-core";
import { trackLeadSubmitted } from "@/lib/lead-analytics";
import { isNetworkFailure } from "@/lib/network-failure";

export interface LeadCollectorArgs {
  name: string;
  email: string;
  note?: string;
}

export interface SubmitLeadResult {
  ok: boolean;
}

const SUBMIT_TIMEOUT_MS = 8000;

/**
 * Posts a collected lead to /api/leads. Exported standalone (not just
 * inlined in the useCopilotAction handler below) so the network logic is
 * unit-testable without the CopilotKit runtime (CT-002).
 */
export async function submitLead(
  source: string,
  args: LeadCollectorArgs,
): Promise<SubmitLeadResult> {
  let ok: boolean;
  try {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...args, source }),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
    ok = res.ok;
  } catch (err) {
    // A blocked or offline request is the visitor's network, not a bug; the caller still tells the
    // visitor the lead did not send (ok: false).
    if (!isNetworkFailure(err)) reportError(err);
    return { ok: false };
  }
  // Outside the try: only a lead the server accepted is reported, and analytics (which never
  // throws) cannot turn a saved lead into a failure. The note is deliberately not passed on.
  if (ok) trackLeadSubmitted({ name: args.name, email: args.email, surface: source });
  return { ok };
}

/**
 * Registers the collectLead CopilotKit action once, for one chat surface.
 * The only intentional difference between the chatbot widget and the /ai
 * page copies was the `source` label passed to /api/leads -- preserved here
 * as the hook's argument (CT-002).
 */
export function useLeadCollectorAction(source: string) {
  useCopilotAction({
    name: "collectLead",
    description:
      "Collect a visitor's name and email when they express interest in hiring or working with Amin. Use this after they decline or can't use the booking link.",
    parameters: [
      {
        name: "name",
        type: "string",
        description: "The visitor's full name",
        required: true,
      },
      {
        name: "email",
        type: "string",
        description: "The visitor's email address",
        required: true,
      },
      {
        name: "note",
        type: "string",
        description: "Brief note about what they're looking for (optional)",
        required: false,
      },
    ],
    handler: async ({ name, email, note }: LeadCollectorArgs) => {
      const result = await submitLead(source, { name, email, note });
      if (result.ok) {
        return `Lead saved for ${name} (${email}). Amin will be in touch soon!`;
      }
      return "Sorry, there was an issue saving your contact details. Please try emailing hello@amindhou.com directly.";
    },
  });
}
