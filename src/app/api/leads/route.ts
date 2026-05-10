import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export interface LeadPayload {
  name: string;
  email: string;
  note?: string;
  source?: string;
}

export async function POST(req: NextRequest) {
  let body: LeadPayload;
  try {
    body = (await req.json()) as LeadPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, note, source } = body;

  if (!name || !email) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  const timestamp = new Date().toISOString();

  console.log(
    JSON.stringify({
      type: "LEAD",
      timestamp,
      name,
      email,
      note: note ?? "",
      source: source ?? "chatbot",
    })
  );

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Amin AI <leads@amindhou.com>",
      to: "amin@devino.ca",
      subject: `New lead from ${name}`,
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        `Note: ${note ?? "—"}`,
        `Source: ${source ?? "chatbot"}`,
        `Time: ${timestamp}`,
      ].join("\n"),
    }).catch((err) => {
      console.error("Resend email failed:", err);
    });
  }

  return NextResponse.json({ ok: true, timestamp });
}
