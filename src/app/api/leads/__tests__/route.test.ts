import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";

const mockSend = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: mockSend };
  },
}));

import { POST } from "../route";

// Distinct IP per request so unrelated tests never trip the per-IP rate limit;
// the dedicated rate-limit test pins its own IP instead.
let ipCounter = 0;
function uniqueIp(): string {
  ipCounter += 1;
  return `10.20.${Math.floor(ipCounter / 256) % 256}.${ipCounter % 256}`;
}

function makeReq(
  body: unknown,
  opts: { ip?: string; origin?: string | null; host?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  const origin = opts.origin === undefined ? "https://amindhou.com" : opts.origin;
  if (origin) headers["origin"] = origin;
  headers["x-forwarded-host"] = opts.host ?? "amindhou.com";
  headers["x-forwarded-for"] = opts.ip ?? uniqueIp();
  return new NextRequest("https://amindhou.com/api/leads", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// The route and this test import the same node:fs `promises` singleton, so
// spying on its methods intercepts the route's writes without hitting disk.
describe("POST /api/leads", () => {
  let savedResendKey: string | undefined;

  beforeEach(() => {
    savedResendKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fs, "appendFile").mockResolvedValue(undefined);
    mockSend.mockReset().mockResolvedValue({ data: { id: "email_1" }, error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedResendKey;
  });

  it("persists the lead and sends the email on the happy path", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    const res = await POST(makeReq({ name: "Ada", email: "ada@example.com", note: "hire me" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });

    const mkdir = vi.mocked(fs.mkdir);
    const appendFile = vi.mocked(fs.appendFile);
    expect(mkdir).toHaveBeenCalledOnce();
    expect(appendFile).toHaveBeenCalledOnce();
    const [filePath, line] = appendFile.mock.calls[0];
    expect(String(filePath)).toContain("leads.jsonl");
    const record = JSON.parse(String(line).trim());
    expect(record).toMatchObject({
      name: "Ada",
      email: "ada@example.com",
      note: "hire me",
      source: "chatbot",
    });
    expect(typeof record.timestamp).toBe("string");
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("returns ok:true when the email send fails but the lead is persisted", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    mockSend.mockRejectedValueOnce(new Error("resend unreachable"));
    const res = await POST(makeReq({ name: "Ada", email: "ada@example.com" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(vi.mocked(fs.appendFile)).toHaveBeenCalledOnce();
  });

  it("returns ok:true when persistence fails but the email is sent", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    vi.mocked(fs.appendFile).mockRejectedValueOnce(new Error("disk full"));
    const res = await POST(makeReq({ name: "Ada", email: "ada@example.com" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("returns 500 ok:false when both persistence and email fail", async () => {
    // No RESEND_API_KEY → no email attempted; persistence rejects.
    vi.mocked(fs.appendFile).mockRejectedValueOnce(new Error("disk full"));
    const res = await POST(makeReq({ name: "Ada", email: "ada@example.com" }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("rejects a cross-origin request with 403 before touching disk", async () => {
    const res = await POST(
      makeReq({ name: "Ada", email: "ada@example.com" }, { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    expect(vi.mocked(fs.appendFile)).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rate limits after 5 requests per minute from one IP with 429 + Retry-After", async () => {
    const ip = "55.55.55.55";
    for (let i = 0; i < 5; i++) {
      const ok = await POST(makeReq({ name: "Ada", email: "ada@example.com" }, { ip }));
      expect(ok.status).toBe(200);
    }
    const limited = await POST(makeReq({ name: "Ada", email: "ada@example.com" }, { ip }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect(await limited.json()).toMatchObject({ error: expect.any(String) });
  });

  it("caps an oversized note before persisting", async () => {
    const bigNote = "x".repeat(10_000);
    const res = await POST(makeReq({ name: "Ada", email: "ada@example.com", note: bigNote }));

    expect(res.status).toBe(200);
    const [, line] = vi.mocked(fs.appendFile).mock.calls[0];
    const record = JSON.parse(String(line).trim());
    expect(record.note.length).toBe(5000);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeReq({ email: "ada@example.com" }));
    expect(res.status).toBe(400);
    expect(vi.mocked(fs.appendFile)).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid email format", async () => {
    const res = await POST(makeReq({ name: "Ada", email: "not-an-email" }));
    expect(res.status).toBe(400);
  });
});
