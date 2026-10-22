import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appendLead } from "@/lib/leads-store";
import { guardedJsonRoute } from "@/lib/route-guard";
import { captureException, logWarn } from "@/lib/log";
import { sendSendlyEmail } from "@/lib/sendly";
import { env } from "@/env";

export interface LeadPayload {
  name: string;
  email: string;
  note?: string;
  source?: string;
}

// Cap persisted fields so a hostile payload can't bloat the leads table.
const NAME_MAX = 200;
const EMAIL_MAX = 320;
const NOTE_MAX = 5000;
const SOURCE_MAX = 100;
const PAGE_MAX = 200;

// Process-wide ceiling on notification emails per UTC day. The per-IP limit (5/min) alone lets a
// botnet turn every lead into a Sendly email; past this many, leads are still stored but no email
// is sent. The response is identical either way so the cap is not an oracle. The counter is
// in-memory and resets on restart, which only ever loosens it by a handful of emails.
const LEAD_EMAIL_DAILY_CAP = 50;
let emailDay = "";
let emailsToday = 0;

/** Reserves one email slot for today (UTC) and returns its day key; null once the cap is spent. */
function takeEmailSlot(): string | null {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== emailDay) {
    emailDay = day;
    emailsToday = 0;
  }
  if (emailsToday >= LEAD_EMAIL_DAILY_CAP) return null;
  emailsToday += 1;
  return day;
}

/** Gives back a slot whose send failed, so an outage cannot spend the day's budget. */
function releaseEmailSlot(day: string): void {
  if (day === emailDay && emailsToday > 0) emailsToday -= 1;
}

// Validates the body is a JSON object; the individual fields are narrowed below
// (gate rule 3: API routes must zod-parse their input). Fields stay `unknown` so
// the existing hand-rolled field checks remain the source of truth.
const leadSchema = z.object({
  name: z.unknown(),
  email: z.unknown(),
  note: z.unknown().optional(),
  source: z.unknown().optional(),
});

/**
 * Which page produced the lead (persisted as `page`): the referer's pathname.
 * The chat widget is mounted site-wide, so without this the owner cannot tell
 * a homepage lead from an /ai page lead (P2-DATA-006).
 */
function leadPage(req: NextRequest): string {
  const referer = req.headers.get("referer");
  if (!referer) return "";
  try {
    return new URL(referer).pathname.slice(0, PAGE_MAX);
  } catch {
    // silent-ok: an unparseable referer header is external junk a client can
    // send at will; the empty page string is the honest recorded value.
    return "";
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardedJsonRoute(req, { key: "leads", limit: 5, windowMs: 60_000 });
  if (!guard.ok) return guard.response;

  const parsed = leadSchema.safeParse(guard.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }
  const { name, email, note, source } = parsed.data;

  if (typeof name !== "string" || !name || typeof email !== "string" || !email) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  const input = {
    name: name.slice(0, NAME_MAX),
    email: email.slice(0, EMAIL_MAX),
    note: (typeof note === "string" ? note : "").slice(0, NOTE_MAX),
    source: (typeof source === "string" ? source : "chatbot").slice(0, SOURCE_MAX),
    page: leadPage(req),
  };

  // Persist first: the email provider is best-effort, so a durable record in
  // the database is what guarantees a lead is never silently lost.
  let persisted: { id: string; createdAt: string } | null = null;
  try {
    const record = await appendLead(input);
    persisted = { id: record.id, createdAt: record.createdAt };
  } catch (err) {
    captureException("leads.persist", err);
  }

  // Breadcrumb for the container log, deliberately carrying no PII: stdout ends
  // up in Dokploy's log store, which is not an appropriate home for a visitor's
  // name, email or message. Those live in the database row and the notification
  // email. `id` correlates this line to that row, and is null when the write
  // failed (captureException above already recorded why).
  console.log(
    JSON.stringify({
      type: "LEAD",
      id: persisted?.id ?? null,
      source: input.source,
      page: input.page,
    }),
  );

  let emailOk = false;
  let slotDay: string | null = null;
  if (env.SENDLY_API_KEY) {
    slotDay = takeEmailSlot();
    if (slotDay === null) {
      logWarn("leads", "daily lead email cap reached, lead stored without notification", {
        id: persisted?.id ?? null,
      });
    }
  }
  if (env.SENDLY_API_KEY && slotDay !== null) {
    try {
      await sendSendlyEmail({
        apiKey: env.SENDLY_API_KEY,
        from: { email: "hello@amindhou.com", name: "Amin AI" },
        to: "amin@devino.ca",
        // One-click answer to the lead. Sendly validates `reply` with a stricter email check than
        // this route's, and a 422 would drop the whole notification, so only pass a clean address.
        reply: z.email().safeParse(input.email).success ? input.email : undefined,
        subject: `New lead from ${input.name}`,
        text: [
          `Name: ${input.name}`,
          `Email: ${input.email}`,
          `Note: ${input.note || "-"}`,
          `Source: ${input.source}`,
          `Page: ${input.page || "-"}`,
          `Time: ${persisted?.createdAt ?? new Date().toISOString()}`,
        ].join("\n"),
        // The lead id makes a retry of this same send a no-op at Sendly.
        idempotencyKey: persisted?.id,
      });
      emailOk = true;
    } catch (err) {
      // A non-2xx (bad key, unverified domain, rate limit), a network error
      // and the deadline all land here; the lead is already persisted.
      captureException("leads.email", err);
      releaseEmailSlot(slotDay);
    }
  }

  // Only fail the request if the lead reached neither the disk nor an inbox.
  if (!persisted && !emailOk) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: persisted?.id ?? null,
    createdAt: persisted?.createdAt ?? null,
  });
}
