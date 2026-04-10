import { NextRequest, NextResponse } from "next/server";

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

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  const timestamp = new Date().toISOString();

  // Log to server stdout — visible in Dokploy/Docker logs
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

  // TODO: send email notification via Resend / Nodemailer when configured
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({ from: 'leads@amindhou.com', to: 'amin@devino.ca', ... });

  return NextResponse.json({ ok: true, timestamp });
}
