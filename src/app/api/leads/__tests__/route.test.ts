import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockFetch = vi.hoisted(() => vi.fn());
const mockAppendLead = vi.hoisted(() => vi.fn());

vi.mock("@/lib/leads-store", () => ({
  appendLead: mockAppendLead,
}));

vi.mock("@/lib/log", () => ({
  captureException: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import { POST } from "../route";
import { captureException } from "@/lib/log";
import { makeJsonPostRequest } from "@/test/api-route-helpers";

function sendlyAccepted(): Response {
  return new Response(
    JSON.stringify({ id: "em_1", status: "PENDING", to: "amin@devino.ca", from: "x" }),
    { status: 202 },
  );
}

function sendlyProblem(status: number, code: string): Response {
  return new Response(JSON.stringify({ status, code, title: "nope" }), {
    status,
    headers: { "content-type": "application/problem+json" },
  });
}

/** The JSON body of the (single) Sendly request the route made. */
function sentBody(): {
  from: unknown;
  to: string;
  reply?: string;
  subject: string;
  body: string;
} {
  const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe("POST /api/leads", () => {
  let savedSendlyKey: string | undefined;

  beforeEach(() => {
    savedSendlyKey = process.env.SENDLY_API_KEY;
    delete process.env.SENDLY_API_KEY;
    mockFetch.mockReset().mockImplementation(async () => sendlyAccepted());
    vi.stubGlobal("fetch", mockFetch);
    vi.mocked(captureException).mockClear();
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
    vi.unstubAllGlobals();
    if (savedSendlyKey === undefined) delete process.env.SENDLY_API_KEY;
    else process.env.SENDLY_API_KEY = savedSendlyKey;
  });

  it("persists the lead and sends the email on the happy path", async () => {
    process.env.SENDLY_API_KEY = "sk_test_key";
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
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("logs a breadcrumb carrying no PII", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await POST(
      makeJsonPostRequest(
        { name: "Ada", email: "ada@example.com", note: "hire me" },
        { referer: "https://amindhou.com/ai" },
      ),
    );

    expect(logSpy).toHaveBeenCalledOnce();
    const line = logSpy.mock.calls[0]?.[0] as string;
    expect(JSON.parse(line)).toEqual({
      type: "LEAD",
      id: "test-uuid",
      source: "chatbot",
      page: "/ai",
    });
    // The point of the pin: stdout reaches the container log store, so the
    // visitor's name, address and message must never appear there.
    expect(line).not.toContain("Ada");
    expect(line).not.toContain("ada@example.com");
    expect(line).not.toContain("hire me");
  });

  it("logs a null id when persistence fails", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockAppendLead.mockRejectedValueOnce(new Error("db down"));
    process.env.SENDLY_API_KEY = "sk_test_key";

    await POST(makeJsonPostRequest({ name: "Ada", email: "ada@example.com" }));

    const line = logSpy.mock.calls[0]?.[0] as string;
    expect(JSON.parse(line)).toMatchObject({ type: "LEAD", id: null });
  });

  it("records an empty page when no referer header is present", async () => {
    const res = await POST(makeJsonPostRequest({ name: "Ada", email: "ada@example.com" }));
    expect(res.status).toBe(200);
    const call = mockAppendLead.mock.calls[0]?.[0];
    expect(call?.page).toBe("");
  });

  it("does not call Sendly when no key is set", async () => {
    const res = await POST(makeJsonPostRequest({ name: "Ada", email: "ada@example.com" }));
    expect(res.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("returns ok:true when the email send fails but the lead is persisted", async () => {
    process.env.SENDLY_API_KEY = "sk_test_key";
    mockFetch.mockRejectedValueOnce(new Error("sendly unreachable"));
    const res = await POST(makeJsonPostRequest({ name: "Ada", email: "ada@example.com" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockAppendLead).toHaveBeenCalledOnce();
    expect(captureException).toHaveBeenCalledWith(
      "leads.email",
      expect.objectContaining({ message: "sendly unreachable" }),
    );
  });

  it("reports a Sendly API error with its status and code, never the key", async () => {
    process.env.SENDLY_API_KEY = "sk_test_key";
    // fetch RESOLVES on an API-level failure (bad key, unverified domain,
    // rate limit); the route must report it, not record a false success.
    mockFetch.mockResolvedValueOnce(sendlyProblem(401, "invalid_api_key"));
    const res = await POST(makeJsonPostRequest({ name: "Ada", email: "ada@example.com" }));

    expect(res.status).toBe(200); // the lead is still persisted
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(captureException).toHaveBeenCalledOnce();
    const [scope, err] = vi.mocked(captureException).mock.calls[0] ?? [];
    expect(scope).toBe("leads.email");
    expect((err as Error).message).toContain("401");
    expect((err as Error).message).toContain("invalid_api_key");
    expect(JSON.stringify(err, Object.getOwnPropertyNames(err))).not.toContain("sk_test_key");
  });

  it("reports a non-JSON error body by its status alone", async () => {
    process.env.SENDLY_API_KEY = "sk_test_key";
    mockFetch.mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 502 }));
    const res = await POST(makeJsonPostRequest({ name: "Ada", email: "ada@example.com" }));

    expect(await res.json()).toMatchObject({ ok: true });
    const [, err] = vi.mocked(captureException).mock.calls[0] ?? [];
    expect((err as Error).message).toBe("Sendly send failed: HTTP 502");
  });

  it("returns ok:true when persistence fails but the email is sent", async () => {
    process.env.SENDLY_API_KEY = "sk_test_key";
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

  it("returns 500 when persistence fails and Sendly rejects the send", async () => {
    process.env.SENDLY_API_KEY = "sk_test_key";
    mockAppendLead.mockRejectedValueOnce(new Error("db down"));
    mockFetch.mockResolvedValueOnce(sendlyProblem(429, "rate_limited"));
    const res = await POST(makeJsonPostRequest({ name: "Ada", email: "ada@example.com" }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("posts the documented request to Sendly", async () => {
    process.env.SENDLY_API_KEY = "sk_test_key";
    await POST(
      makeJsonPostRequest(
        { name: "Ada", email: "ada@example.com", note: "hire me", source: "chatbot" },
        { referer: "https://amindhou.com/ai?utm=x" },
      ),
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sendly.now/api/v1/emails");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_key");
    expect(headers["content-type"]).toBe("application/json");
    // The persisted lead id doubles as the idempotency key.
    expect(headers["Idempotency-Key"]).toBe("test-uuid");

    const body = sentBody();
    expect(body.from).toEqual({ email: "hello@amindhou.com", name: "Amin AI" });
    expect(body.to).toBe("amin@devino.ca");
    expect(body.reply).toBe("ada@example.com");
    expect(body.subject).toBe("New lead from Ada");
    expect(body.body).toBe(
      [
        "Name: Ada",
        "Email: ada@example.com",
        "Note: hire me",
        "Source: chatbot",
        "Page: /ai",
        "Time: 2026-07-08T00:00:00.000Z",
      ].join("<br>\n"),
    );
  });

  it("omits reply when the address would not pass Sendly's stricter email check", async () => {
    process.env.SENDLY_API_KEY = "sk_test_key";
    await POST(makeJsonPostRequest({ name: "Ada", email: "a@b.c" }));

    expect(sentBody()).not.toHaveProperty("reply");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("sends no Idempotency-Key when the lead was not persisted", async () => {
    process.env.SENDLY_API_KEY = "sk_test_key";
    mockAppendLead.mockRejectedValueOnce(new Error("db down"));
    await POST(makeJsonPostRequest({ name: "Ada", email: "ada@example.com" }));

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).not.toHaveProperty("Idempotency-Key");
  });

  it("strips CR and LF from the subject so a crafted name cannot 422 the send", async () => {
    process.env.SENDLY_API_KEY = "sk_test_key";
    await POST(
      makeJsonPostRequest({ name: "Ada\r\nBcc: evil@example.com\nX", email: "ada@example.com" }),
    );

    const { subject } = sentBody();
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject).toBe("New lead from Ada Bcc: evil@example.com X");
  });

  it("HTML-escapes visitor-supplied fields in the Sendly body", async () => {
    process.env.SENDLY_API_KEY = "sk_test_key";
    await POST(
      makeJsonPostRequest(
        {
          name: "<script>alert(1)</script>",
          email: "a&b@example.com",
          note: 'say "hi" & it\'s <b>bold</b>\nsecond line',
          source: "<img src=x onerror=alert(1)>",
        },
        { referer: "https://amindhou.com/<x>" },
      ),
    );

    const { body, subject } = sentBody();
    expect(body).not.toContain("<script>");
    expect(body).not.toContain("<b>");
    expect(body).not.toContain("<img");
    expect(body).toContain("Name: &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(body).toContain("Email: a&amp;b@example.com");
    expect(body).toContain(
      "Note: say &quot;hi&quot; &amp; it&#39;s &lt;b&gt;bold&lt;/b&gt;<br>\nsecond line",
    );
    expect(body).toContain("Source: &lt;img src=x onerror=alert(1)&gt;");
    // The only markup left in the body is the <br> line breaks the route adds.
    expect(body.replace(/<br>/g, "")).not.toMatch(/<[a-z/]/i);
    // The subject is plain text: not entity-encoded, just CR/LF-free.
    expect(subject).toBe("New lead from <script>alert(1)</script>");
  });

  it("keeps template syntax in visitor text away from Sendly's template engine", async () => {
    process.env.SENDLY_API_KEY = "sk_test_key";
    await POST(
      makeJsonPostRequest({
        name: "{{#if x}} Ada",
        email: "ada@example.com",
        note: "{{unsubscribeUrl}} {{{raw}}} {{#each}}",
      }),
    );

    const { body, subject } = sentBody();
    expect(body).not.toContain("{");
    expect(body).toContain("&#123;&#123;unsubscribeUrl}}");
    expect(subject).not.toContain("{{");
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
    expect(mockFetch).not.toHaveBeenCalled();
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
