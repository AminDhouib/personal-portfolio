import { describe, it, expect, beforeEach, vi } from "vitest";
import { submitLead } from "../use-lead-collector-action";

describe("submitLead", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let reportErrorMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    reportErrorMock = vi.fn();
    vi.stubGlobal("reportError", reportErrorMock);
  });

  it("POSTs to /api/leads with the given source and an AbortSignal", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await submitLead("chatbot", { name: "Ada", email: "ada@example.com", note: "hi" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/leads");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      source: "chatbot",
      name: "Ada",
      email: "ada@example.com",
      note: "hi",
    });
  });

  it("preserves the source label across the two chat surfaces (ai-page)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await submitLead("ai-page", { name: "Ada", email: "ada@example.com" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.source).toBe("ai-page");
  });

  it("returns { ok: true } on a successful response", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await submitLead("chatbot", { name: "Ada", email: "ada@example.com" });
    expect(result).toEqual({ ok: true });
  });

  it("returns { ok: false } on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    const result = await submitLead("chatbot", { name: "Ada", email: "ada@example.com" });
    expect(result).toEqual({ ok: false });
  });

  it("reports and returns { ok: false } when fetch rejects (e.g. timeout)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"));

    const result = await submitLead("chatbot", { name: "Ada", email: "ada@example.com" });
    expect(result).toEqual({ ok: false });
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });
});
