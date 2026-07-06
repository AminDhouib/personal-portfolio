import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Resend } from "resend";
import { checkRateLimit, getClientIp, isSameOrigin } from "@/lib/rate-limit";
import { captureException } from "@/lib/log";

export interface LeadPayload {
  name: string;
  email: string;
  note?: string;
  source?: string;
}

// Cap persisted fields so a hostile payload can't bloat the leads file on disk.
const NAME_MAX = 200;
const EMAIL_MAX = 320;
const NOTE_MAX = 5000;
const SOURCE_MAX = 100;

// Validates the body is a JSON object; the individual fields are narrowed below
// (gate rule 3: API routes must zod-parse their input). Fields stay `unknown` so
// the existing hand-rolled field checks remain the source of truth.
const leadSchema = z.object({
  name: z.unknown(),
  email: z.unknown(),
  note: z.unknown().optional(),
  source: z.unknown().optional(),
});

function leadsPaths(): { dataDir: string; filePath: string } {
  const dataDir = process.env.LEADS_DATA_DIR ?? path.join(process.cwd(), ".data");
  return { dataDir, filePath: path.join(dataDir, "leads.jsonl") };
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rate = checkRateLimit(`leads:${getClientIp(req)}`, { limit: 5, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    // silent-ok: malformed request JSON is a client error, surfaced as the 400 below
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(raw);
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

  const noteStr = typeof note === "string" ? note : "";
  const sourceStr = typeof source === "string" ? source : "chatbot";
  const timestamp = new Date().toISOString();
  const record = {
    name: name.slice(0, NAME_MAX),
    email: email.slice(0, EMAIL_MAX),
    note: noteStr.slice(0, NOTE_MAX),
    source: sourceStr.slice(0, SOURCE_MAX),
    timestamp,
  };

  console.log(JSON.stringify({ type: "LEAD", ...record }));

  // Persist first: the email provider is best-effort, so a durable record on the
  // mounted volume is what guarantees a lead is never silently lost.
  let persistOk = false;
  try {
    const { dataDir, filePath } = leadsPaths();
    await fs.mkdir(dataDir, { recursive: true });
    await fs.appendFile(filePath, JSON.stringify(record) + "\n", "utf-8");
    persistOk = true;
  } catch (err) {
    captureException("leads.persist", err);
  }

  let emailOk = false;
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "Amin AI <leads@amindhou.com>",
        to: "amin@devino.ca",
        subject: `New lead from ${record.name}`,
        text: [
          `Name: ${record.name}`,
          `Email: ${record.email}`,
          `Note: ${record.note || "—"}`,
          `Source: ${record.source}`,
          `Time: ${timestamp}`,
        ].join("\n"),
      });
      emailOk = true;
    } catch (err) {
      captureException("leads.email", err);
    }
  }

  // Only fail the request if the lead reached neither the disk nor an inbox.
  if (!persistOk && !emailOk) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true, timestamp });
}
