import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/log", () => ({ logWarn: vi.fn(), captureException: vi.fn() }));

import { POST } from "../route";
import { logWarn, captureException } from "@/lib/log";

const ALLOWED_DSN = "https://fd4e552a55f694418e7471d92de7873a@sentry.devino.ca/35";
const INGEST_URL = "https://sentry.devino.ca/api/35/envelope/";
// Mirrors MAX_ENVELOPE_BYTES in route.ts: sized for replay segments, not just error events.
const MAX_BYTES = 5 * 1024 * 1024;

function envelope(dsn: string): string {
  return `${JSON.stringify({ dsn, sent_at: "2026-07-06T00:00:00.000Z" })}\n{"type":"event"}\n{"message":"boom"}`;
}

// Distinct IP per request so the per-IP rate limit never trips across tests.
let ipCounter = 0;
function makeReq(body: string | Uint8Array, headers: Record<string, string> = {}): NextRequest {
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
    vi.mocked(captureException).mockClear();
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
    expect(Buffer.from(init.body as Uint8Array).toString("utf8")).toBe(body);
  });

  // Session replay: the SDK posts a `replay_event` item and a `replay_recording` item whose
  // payload is a compressed (non-UTF8) binary blob. The relay must pass those bytes through
  // untouched; decoding the body as text would replace invalid sequences and corrupt the replay.
  it("relays a binary replay envelope byte-for-byte", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ status: 200 } as Response);
    vi.stubGlobal("fetch", fetchSpy);
    const head = Buffer.from(
      `${JSON.stringify({ dsn: ALLOWED_DSN })}\n{"type":"replay_event"}\n{"segment_id":0}\n{"type":"replay_recording","length":6}\n`,
    );
    // gzip magic number plus bytes that are not valid UTF-8 (0x8b, 0xff, 0xfe, 0x00).
    const recording = Buffer.from([0x1f, 0x8b, 0xff, 0xfe, 0x00, 0xc3]);
    const body = Buffer.concat([head, recording, Buffer.from("\n")]);

    const res = await POST(makeReq(body));

    expect(res.status).toBe(200);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(Buffer.from(init.body as Uint8Array).equals(body)).toBe(true);
  });

  it("relays a replay-sized envelope above the old 1 MiB cap", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ status: 200 } as Response);
    vi.stubGlobal("fetch", fetchSpy);
    const head = Buffer.from(
      `${JSON.stringify({ dsn: ALLOWED_DSN })}\n{"type":"replay_recording"}\n`,
    );
    const body = Buffer.concat([head, Buffer.alloc(2 * 1024 * 1024, 0xff)]);

    const res = await POST(makeReq(body));

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses to relay an envelope for a foreign DSN", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await POST(makeReq(envelope("https://attacker@sentry.devino.ca/999")));

    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a garbage envelope header with 400 and reports it", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await POST(makeReq("not-json\nstuff"));

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-origin posts", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await POST(makeReq(envelope(ALLOWED_DSN), { origin: "https://evil.test" }));

    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("caps envelope size by bytes, not characters", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const head = Buffer.from(`${JSON.stringify({ dsn: ALLOWED_DSN })}\n`);
    const huge = Buffer.concat([head, Buffer.alloc(MAX_BYTES + 1, 0x78)]);

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
