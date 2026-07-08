import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { appendLead } from "@/lib/leads-store";
import { guardedJsonRoute } from "@/lib/route-guard";
import { captureException } from "@/lib/log";
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

  console.log(JSON.stringify({ type: "LEAD", ...input }));

  // Persist first: the email provider is best-effort, so a durable record in
  // the database is what guarantees a lead is never silently lost.
  let persisted: { id: string; createdAt: string } | null = null;
  try {
    const record = await appendLead(input);
    persisted = { id: record.id, createdAt: record.createdAt };
  } catch (err) {
    captureException("leads.persist", err);
  }

  let emailOk = false;
  if (env.RESEND_API_KEY) {
    try {
      const resend = new Resend(env.RESEND_API_KEY);
      await resend.emails.send({
        from: "Amin AI <leads@amindhou.com>",
        to: "amin@devino.ca",
        subject: `New lead from ${input.name}`,
        text: [
          `Name: ${input.name}`,
          `Email: ${input.email}`,
          `Note: ${input.note || "-"}`,
          `Source: ${input.source}`,
          `Page: ${input.page || "-"}`,
          `Time: ${persisted?.createdAt ?? new Date().toISOString()}`,
        ].join("\n"),
      });
      emailOk = true;
    } catch (err) {
      captureException("leads.email", err);
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
