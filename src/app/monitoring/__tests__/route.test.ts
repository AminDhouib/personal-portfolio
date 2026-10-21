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
    // Copy into a plain ArrayBuffer-backed view: a Node Buffer's wider buffer type is not a BodyInit.
    body: typeof body === "string" ? body : new Uint8Array(body),
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

  // The failure line is the only evidence the next occurrence leaves behind, so it has to say
  // which failure it was (timeout vs network vs upstream status), how long it took and how big
  // the envelope was. The detail is a plain object so it renders as greppable JSON.
  describe("failure diagnostics", () => {
    function lastDetail(): Record<string, unknown> {
      const call = vi.mocked(logWarn).mock.calls.at(-1);
      expect(call?.[0]).toBe("monitoring");
      return call?.[2] as Record<string, unknown>;
    }

    it("answers 504 and logs cause=timeout, duration and bytes when the upstream deadline fires", async () => {
      const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
      const body = envelope(ALLOWED_DSN);

      const res = await POST(makeReq(body));

      expect(res.status).toBe(504);
      expect(logWarn).toHaveBeenCalledTimes(1);
      expect(vi.mocked(logWarn).mock.calls[0]?.[1]).toBe("envelope relay to Sentry failed");
      const detail = lastDetail();
      expect(detail).toMatchObject({ cause: "timeout", bytes: Buffer.byteLength(body) });
      expect(typeof detail.durationMs).toBe("number");
      expect(detail.error).toContain("timeout");
    });

    it("answers 502 and logs cause=network for a connection failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

      const res = await POST(makeReq(envelope(ALLOWED_DSN)));

      expect(res.status).toBe(502);
      expect(lastDetail()).toMatchObject({ cause: "network", error: "fetch failed" });
    });

    it("passes an upstream 5xx through and logs cause=upstream-status with the status", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 503 } as Response));

      const res = await POST(makeReq(envelope(ALLOWED_DSN)));

      expect(res.status).toBe(503);
      expect(logWarn).toHaveBeenCalledTimes(1);
      expect(vi.mocked(logWarn).mock.calls[0]?.[1]).toBe("envelope relay got an error status");
      expect(lastDetail()).toMatchObject({ cause: "upstream-status", status: 503 });
    });

    it("stays quiet for a 2xx and for a 4xx the SDK caused (no log noise per dropped envelope)", async () => {
      const fetchSpy = vi
        .fn()
        .mockResolvedValueOnce({ status: 200 } as Response)
        .mockResolvedValueOnce({ status: 400 } as Response);
      vi.stubGlobal("fetch", fetchSpy);

      expect((await POST(makeReq(envelope(ALLOWED_DSN)))).status).toBe(200);
      expect((await POST(makeReq(envelope(ALLOWED_DSN)))).status).toBe(400);

      expect(logWarn).not.toHaveBeenCalled();
    });

    it("never captures a relay failure as a Sentry event (no loop through the tunnel)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

      await POST(makeReq(envelope(ALLOWED_DSN)));

      expect(captureException).not.toHaveBeenCalled();
    });
  });

  // request.arrayBuffer() had no deadline: a client that opens the POST and trickles (or stalls)
  // the body held the handler open indefinitely, outside the 8s upstream timeout.
  describe("request body deadline", () => {
    it("answers 408 and never relays when the body does not arrive in time", async () => {
      vi.useFakeTimers();
      try {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        const req = makeReq(envelope(ALLOWED_DSN));
        vi.spyOn(req, "arrayBuffer").mockReturnValue(new Promise<ArrayBuffer>(() => {}));

        const pending = POST(req);
        await vi.advanceTimersByTimeAsync(10_000);
        const res = await pending;

        expect(res.status).toBe(408);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(logWarn).toHaveBeenCalledTimes(1);
        expect(vi.mocked(logWarn).mock.calls[0]?.[1]).toBe("request body read timed out");
        expect(vi.mocked(logWarn).mock.calls[0]?.[2]).toMatchObject({ cause: "body-timeout" });
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not trip the deadline for a body that arrives promptly", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 } as Response));

      const res = await POST(makeReq(envelope(ALLOWED_DSN)));

      expect(res.status).toBe(200);
      expect(logWarn).not.toHaveBeenCalled();
    });
  });
});
