import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendSendlyEmail } from "../sendly";

const mockFetch = vi.hoisted(() => vi.fn());

const base = {
  apiKey: "sk_test_key",
  from: { email: "hello@amindhou.com", name: "Amin AI" },
  to: "amin@devino.ca",
  subject: "Hello",
  text: "line one\nline two",
};

function sent(call = 0): { subject: string; body: string; reply?: string } {
  const init = mockFetch.mock.calls[call]?.[1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe("sendSendlyEmail", () => {
  beforeEach(() => {
    mockFetch.mockReset().mockImplementation(async () => new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caps the subject at Sendly's 998 characters", async () => {
    await sendSendlyEmail({ ...base, subject: "s".repeat(2000) });
    expect(sent().subject).toHaveLength(998);
  });

  it("breaks every {{ opener in the subject, even a run of braces", async () => {
    await sendSendlyEmail({ ...base, subject: "a {{{x}} {{#if" });
    expect(sent().subject).not.toContain("{{");
  });

  it("turns CR, LF and CRLF in the text into <br> line breaks", async () => {
    await sendSendlyEmail({ ...base, text: "a\r\nb\rc\nd" });
    expect(sent().body).toBe("a<br>\nb<br>\nc<br>\nd");
  });

  it("encodes & < > quotes and braces in the body, leaving no live markup", async () => {
    await sendSendlyEmail({ ...base, text: `<script>x</script> & "q" 'a' {{y}}` });
    expect(sent().body).toBe(
      "&lt;script&gt;x&lt;/script&gt; &amp; &quot;q&quot; &#39;a&#39; &#123;&#123;y}}",
    );
  });

  it("does not double-encode: an entity-looking input is escaped once", async () => {
    await sendSendlyEmail({ ...base, text: "&lt;" });
    expect(sent().body).toBe("&amp;lt;");
  });

  it("passes reply through when given and leaves it out otherwise", async () => {
    await sendSendlyEmail({ ...base, reply: "ada@example.com" });
    expect(sent(0).reply).toBe("ada@example.com");
    await sendSendlyEmail(base);
    expect(sent(1)).not.toHaveProperty("reply");
  });

  it("refuses redirects so a replayed GET can never look like a sent email", async () => {
    await sendSendlyEmail(base);
    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.redirect).toBe("error");
  });

  it("still resolves when cancelling the response body rejects", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      body: { cancel: () => Promise.reject(new Error("cancel failed")) },
    });
    await expect(sendSendlyEmail(base)).resolves.toBeUndefined();
  });

  it("omits the Idempotency-Key header unless one is given", async () => {
    await sendSendlyEmail(base);
    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).not.toHaveProperty("Idempotency-Key");
  });

  it("rejects with the status and Sendly error code on a non-2xx", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "domain_not_allowed" }), { status: 403 }),
    );
    await expect(sendSendlyEmail(base)).rejects.toThrow(
      "Sendly send failed: HTTP 403 domain_not_allowed",
    );
  });

  it("reports the status alone when the error body has no string code", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 7 }), { status: 500 }));
    await expect(sendSendlyEmail(base)).rejects.toThrow(/^Sendly send failed: HTTP 500$/);
    mockFetch.mockResolvedValueOnce(new Response("null", { status: 500 }));
    await expect(sendSendlyEmail(base)).rejects.toThrow(/^Sendly send failed: HTTP 500$/);
  });
});
