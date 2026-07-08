import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockSend = vi.hoisted(() => vi.fn());
const mockAppendLead = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: mockSend };
  },
}));

vi.mock("@/lib/leads-store", () => ({
  appendLead: mockAppendLead,
}));

vi.mock("@/lib/log", () => ({
  captureException: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import { POST } from "../route";
import { makeJsonPostRequest } from "@/test/api-route-helpers";

describe("POST /api/leads", () => {
  let savedResendKey: string | undefined;

  beforeEach(() => {
    savedResendKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    mockSend.mockReset().mockResolvedValue({ data: { id: "email_1" }, error: null });
    mockAppendLead.mockReset().mockResolvedValue({
      id: "test-uuid",
      name: "Ada",
      email: "ada@example.com",
      note: "",
      source: "chatbot",
      page: "",
      createdAt: "2026-07-08T00:00:00.000Z",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedResendKey;
  });

  it("persists the lead and sends the email on the happy path", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    const res = await POST(
      makeJsonPostRequest(
        { name: "Ada", email: "ada@example.com", note: "hire me" },
        { referer: "https://amindhou.com/ai?utm=x" },
      ),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; id: string; createdAt: string };
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe("string");

    expect(mockAppendLead).toHaveBeenCalledOnce();
    const call = mockAppendLead.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      name: "Ada",
      email: "ada@example.com",
      note: "hire me",
      source: "chatbot",
      page: "/ai",
    });
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("records an empty page when no referer header is present", async () => {
    const res = await POST(makeJsonPostRequest({ name: "Ada", email: "ada@example.com" }));
    expect(res.status).toBe(200);
    const call = mockAppendLead.mock.calls[0]?.[0];
    expect(call?.page).toBe("");
  });

  it("returns ok:true when the email send fails but the lead is persisted", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    mockSend.mockRejectedValueOnce(new Error("resend unreachable"));
    const res = await POST(makeJsonPostRequest({ name: "Ada", email: "ada@example.com" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockAppendLead).toHaveBeenCalledOnce();
  });

  it("returns ok:true when persistence fails but the email is sent", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    mockAppendLead.mockRejectedValueOnce(new Error("db connection refused"));
    const res = await POST(makeJsonPostRequest({ name: "Ada", email: "ada@example.com" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("returns 500 ok:false when both persistence and email fail", async () => {
    mockAppendLead.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(makeJsonPostRequest({ name: "Ada", email: "ada@example.com" }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("rejects a cross-origin request with 403 before touching the db", async () => {
    const res = await POST(
      makeJsonPostRequest(
        { name: "Ada", email: "ada@example.com" },
        { origin: "https://evil.example" },
      ),
    );
    expect(res.status).toBe(403);
    expect(mockAppendLead).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 413 for a body over the 16 KiB cap", async () => {
    const res = await POST(
      makeJsonPostRequest({ name: "Ada", email: "ada@example.com", note: "x".repeat(20_000) }),
    );
    expect(res.status).toBe(413);
    expect(mockAppendLead).not.toHaveBeenCalled();
  });

  it("rate limits after 5 requests per minute from one IP", async () => {
    const ip = "55.55.55.55";
    for (let i = 0; i < 5; i++) {
      const ok = await POST(makeJsonPostRequest({ name: "Ada", email: "ada@example.com" }, { ip }));
      expect(ok.status).toBe(200);
    }
    const limited = await POST(
      makeJsonPostRequest({ name: "Ada", email: "ada@example.com" }, { ip }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeJsonPostRequest({ email: "ada@example.com" }));
    expect(res.status).toBe(400);
    expect(mockAppendLead).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid email format", async () => {
    const res = await POST(makeJsonPostRequest({ name: "Ada", email: "not-an-email" }));
    expect(res.status).toBe(400);
  });
});
