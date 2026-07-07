import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/log", () => ({ logWarn: vi.fn() }));

import { POST } from "../route";
import { logWarn } from "@/lib/log";

const ALLOWED_DSN = "https://fd4e552a55f694418e7471d92de7873a@sentry.devino.ca/35";
const INGEST_URL = "https://sentry.devino.ca/api/35/envelope/";

function envelope(dsn: string): string {
  return `${JSON.stringify({ dsn, sent_at: "2026-07-06T00:00:00.000Z" })}\n{"type":"event"}\n{"message":"boom"}`;
}

// Distinct IP per request so the per-IP rate limit never trips across tests.
let ipCounter = 0;
function makeReq(body: string, headers: Record<string, string> = {}): NextRequest {
  ipCounter += 1;
  return new NextRequest("https://portfolio.test/monitoring", {
    method: "POST",
    body,
    headers: {
      origin: "https://portfolio.test",
      host: "portfolio.test",
      "x-forwarded-for": `10.9.0.${ipCounter % 250}`,
      ...headers,
    },
  });
}

describe("POST /monitoring (Sentry envelope tunnel)", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.mocked(logWarn).mockClear();
  });

  it("relays a valid envelope to the self-hosted ingest endpoint", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ status: 200 } as Response);
    vi.stubGlobal("fetch", fetchSpy);
    const body = envelope(ALLOWED_DSN);

    const res = await POST(makeReq(body));

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(INGEST_URL);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
  });

  it("refuses to relay an envelope for a foreign DSN", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await POST(makeReq(envelope("https://attacker@sentry.devino.ca/999")));

    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a garbage envelope header", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await POST(makeReq("not-json\nstuff"));

    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects cross-origin posts", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await POST(makeReq(envelope(ALLOWED_DSN), { origin: "https://evil.test" }));

    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("caps envelope size", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const huge = `${JSON.stringify({ dsn: ALLOWED_DSN })}\n${"x".repeat(1024 * 1024 + 1)}`;

    const res = await POST(makeReq(huge));

    expect(res.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 502 and logs a warning when Sentry is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("tailnet down")));

    const res = await POST(makeReq(envelope(ALLOWED_DSN)));

    expect(res.status).toBe(502);
    expect(logWarn).toHaveBeenCalledTimes(1);
  });
});
