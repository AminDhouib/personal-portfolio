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
    const fetchSpy = vi.fn().mockResolvedValue({ status: 200, headers: new Headers() } as Response);
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
    const fetchSpy = vi.fn().mockResolvedValue({ status: 200, headers: new Headers() } as Response);
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
    const fetchSpy = vi.fn().mockResolvedValue({ status: 200, headers: new Headers() } as Response);
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

    it("answers 502 and logs cause=network with the underlying error code", async () => {
      // undici reports every connect failure as "fetch failed"; the real reason is cause.code.
      const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new TypeError("fetch failed", { cause: refused })),
      );

      const res = await POST(makeReq(envelope(ALLOWED_DSN)));

      expect(res.status).toBe(502);
      expect(lastDetail()).toMatchObject({
        cause: "network",
        error: "fetch failed",
        code: "ECONNREFUSED",
      });
    });

    it("passes an upstream 5xx through and logs cause=upstream-status with the status", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ status: 503, headers: new Headers() } as Response),
      );

      const res = await POST(makeReq(envelope(ALLOWED_DSN)));

      expect(res.status).toBe(503);
      expect(logWarn).toHaveBeenCalledTimes(1);
      expect(vi.mocked(logWarn).mock.calls[0]?.[1]).toBe("envelope relay got an error status");
      expect(lastDetail()).toMatchObject({ cause: "upstream-status", status: 503 });
    });

    // The browser SDK reads X-Sentry-Rate-Limits first and Retry-After second to decide how long
    // to stop sending; without them it backs off on its own default. Only these two headers, only
    // verbatim from upstream.
    describe("upstream 429", () => {
      function upstream429(headers: Record<string, string>): Response {
        return { status: 429, headers: new Headers(headers) } as Response;
      }

      it("passes Retry-After and X-Sentry-Rate-Limits back verbatim and logs upstream-status", async () => {
        const limits = "60:error;transaction:organization:quota_exceeded:org";
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockResolvedValue(
              upstream429({ "retry-after": "37", "x-sentry-rate-limits": limits }),
            ),
        );

        const res = await POST(makeReq(envelope(ALLOWED_DSN)));

        expect(res.status).toBe(429);
        expect(res.headers.get("retry-after")).toBe("37");
        expect(res.headers.get("x-sentry-rate-limits")).toBe(limits);
        expect(logWarn).toHaveBeenCalledTimes(1);
        expect(lastDetail()).toMatchObject({ cause: "upstream-status", status: 429 });
      });

      it("passes only the one that upstream sent", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream429({ "retry-after": "5" })));

        const res = await POST(makeReq(envelope(ALLOWED_DSN)));

        expect(res.status).toBe(429);
        expect(res.headers.get("retry-after")).toBe("5");
        expect(res.headers.has("x-sentry-rate-limits")).toBe(false);
      });

      it("invents nothing when upstream sent neither header, and drops its other headers", async () => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockResolvedValue(
              upstream429({ "x-request-id": "abc", "content-type": "text/plain" }),
            ),
        );

        const res = await POST(makeReq(envelope(ALLOWED_DSN)));

        expect(res.status).toBe(429);
        expect(res.headers.has("retry-after")).toBe(false);
        expect(res.headers.has("x-sentry-rate-limits")).toBe(false);
        expect(res.headers.has("x-request-id")).toBe(false);
      });
    });

    // The SDK's transport applies X-Sentry-Rate-Limits to every response whatever its status
    // (@sentry/core transports/base.js), so that header crosses on any status; Retry-After is
    // only meaningful on a 429 and stays there.
    it("passes X-Sentry-Rate-Limits on a 503 and a 200 but not Retry-After", async () => {
      const limits = "9:error:key";
      for (const status of [503, 200]) {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            status,
            headers: new Headers({ "retry-after": "9", "x-sentry-rate-limits": limits }),
          } as Response),
        );

        const res = await POST(makeReq(envelope(ALLOWED_DSN)));

        expect(res.status).toBe(status);
        expect(res.headers.get("x-sentry-rate-limits")).toBe(limits);
        expect(res.headers.has("retry-after")).toBe(false);
      }
    });

    it("adds no headers to a non-429 status when upstream sent no rate limits", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          status: 200,
          headers: new Headers({ "x-request-id": "abc" }),
        } as Response),
      );

      const res = await POST(makeReq(envelope(ALLOWED_DSN)));

      expect(res.headers.has("x-sentry-rate-limits")).toBe(false);
      expect(res.headers.has("retry-after")).toBe(false);
      expect(res.headers.has("x-request-id")).toBe(false);
    });

    it("stays quiet for a 2xx and for a 4xx the SDK caused (no log noise per dropped envelope)", async () => {
      const fetchSpy = vi
        .fn()
        .mockResolvedValueOnce({ status: 200, headers: new Headers() } as Response)
        .mockResolvedValueOnce({ status: 400, headers: new Headers() } as Response);
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

  // The body used to be read with request.arrayBuffer() and no deadline: a client that opened
  // the POST and stalled (or trickled) held the handler open outside the upstream timeout.
  describe("request body read", () => {
    const IDLE_MS = 10_000;
    const TOTAL_MS = 30_000;

    /** A controllable request body; `cancelled` flips when the route releases the stream. */
    function streamBody() {
      const state = { cancelled: false };
      let controller!: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>;
      const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(c) {
          controller = c;
        },
        cancel() {
          state.cancelled = true;
        },
      });
      return {
        stream,
        state,
        push: (b: Uint8Array) => controller.enqueue(new Uint8Array(b)),
        close: () => controller.close(),
        fail: (e: unknown) => controller.error(e),
      };
    }

    function reqWithStream(
      stream: ReadableStream<Uint8Array<ArrayBuffer>>,
      headers: Record<string, string> = {},
    ) {
      const req = makeReq("x", headers);
      vi.spyOn(req, "body", "get").mockReturnValue(stream);
      return req;
    }

    async function withFakeTimers(run: () => Promise<void>) {
      vi.useFakeTimers();
      try {
        await run();
      } finally {
        vi.useRealTimers();
      }
    }

    it("answers 408, cancels the stream and logs bytes and declaredBytes after an idle gap", () =>
      withFakeTimers(async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        const b = streamBody();
        b.push(Buffer.from("abc"));

        const pending = POST(reqWithStream(b.stream, { "content-length": "1000" }));
        await vi.advanceTimersByTimeAsync(IDLE_MS);
        const res = await pending;

        expect(res.status).toBe(408);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(b.state.cancelled).toBe(true);
        expect(logWarn).toHaveBeenCalledTimes(1);
        expect(vi.mocked(logWarn).mock.calls[0]?.[1]).toBe("request body read timed out");
        expect(vi.mocked(logWarn).mock.calls[0]?.[2]).toMatchObject({
          cause: "body-timeout",
          deadline: "idle",
          bytes: 3,
          declaredBytes: 1000,
        });
      }));

    it("lets a slow but progressing upload finish: the idle deadline resets on every chunk", () =>
      withFakeTimers(async () => {
        const fetchSpy = vi
          .fn()
          .mockResolvedValue({ status: 200, headers: new Headers() } as Response);
        vi.stubGlobal("fetch", fetchSpy);
        const b = streamBody();
        const head = Buffer.from(`${JSON.stringify({ dsn: ALLOWED_DSN })}\n`);

        const pending = POST(reqWithStream(b.stream));
        b.push(head);
        // Four gaps of 6s: 24s in total, past the 10s idle limit if it did not reset.
        for (let i = 0; i < 4; i += 1) {
          await vi.advanceTimersByTimeAsync(6_000);
          b.push(Buffer.from("x"));
        }
        b.close();
        const res = await pending;

        expect(res.status).toBe(200);
        const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect((init.body as Uint8Array).byteLength).toBe(head.byteLength + 4);
        expect(logWarn).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      }));

    it("stops a trickling upload at the overall cap even though it never goes idle", () =>
      withFakeTimers(async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        const b = streamBody();

        const pending = POST(reqWithStream(b.stream));
        for (let elapsed = 0; elapsed < TOTAL_MS; elapsed += 6_000) {
          b.push(Buffer.from("x"));
          await vi.advanceTimersByTimeAsync(6_000);
        }
        const res = await pending;

        expect(res.status).toBe(408);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(b.state.cancelled).toBe(true);
        expect(vi.mocked(logWarn).mock.calls[0]?.[2]).toMatchObject({
          cause: "body-timeout",
          deadline: "total",
        });
      }));

    it("answers 413 as soon as the cap is crossed and cancels instead of buffering the rest", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const b = streamBody();
      const chunk = new Uint8Array(1024 * 1024).fill(0x78);

      const pending = POST(reqWithStream(b.stream));
      for (let i = 0; i < 6; i += 1) b.push(chunk);
      const res = await pending;

      expect(res.status).toBe(413);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(b.state.cancelled).toBe(true);
    });

    it("logs declaredBytes null (not 0) when a stalled body has no content-length", () =>
      withFakeTimers(async () => {
        vi.stubGlobal("fetch", vi.fn());
        const b = streamBody();

        const pending = POST(reqWithStream(b.stream));
        await vi.advanceTimersByTimeAsync(IDLE_MS);
        const res = await pending;

        expect(res.status).toBe(408);
        expect(vi.mocked(logWarn).mock.calls[0]?.[2]).toMatchObject({
          cause: "body-timeout",
          declaredBytes: null,
        });
      }));

    it("answers 413 from a content-length over the cap without reading, and cancels the body", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const b = streamBody();
      const getReader = vi.spyOn(b.stream, "getReader");

      const res = await POST(reqWithStream(b.stream, { "content-length": String(MAX_BYTES + 1) }));

      expect(res.status).toBe(413);
      expect(getReader).not.toHaveBeenCalled();
      expect(b.state.cancelled).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("relays a body of exactly the cap and refuses one byte more", async () => {
      const fetchSpy = vi
        .fn()
        .mockResolvedValue({ status: 200, headers: new Headers() } as Response);
      vi.stubGlobal("fetch", fetchSpy);
      const head = Buffer.from(`${JSON.stringify({ dsn: ALLOWED_DSN })}
`);
      const exact = Buffer.concat([head, Buffer.alloc(MAX_BYTES - head.byteLength, 0x78)]);
      expect(exact.byteLength).toBe(MAX_BYTES);

      const ok = await POST(makeReq(exact));
      expect(ok.status).toBe(200);
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect((init.body as Uint8Array).byteLength).toBe(MAX_BYTES);

      const over = await POST(makeReq(Buffer.concat([exact, Buffer.from("x")])));
      expect(over.status).toBe(413);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("answers 400 body-read-error, not 408, when the stream breaks (client abort, reset)", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const b = streamBody();

      const pending = POST(reqWithStream(b.stream));
      b.fail(new TypeError("terminated"));
      const res = await pending;

      expect(res.status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(vi.mocked(logWarn).mock.calls[0]?.[1]).toBe("request body read failed");
      expect(vi.mocked(logWarn).mock.calls[0]?.[2]).toMatchObject({
        cause: "body-read-error",
        error: "terminated",
      });
    });

    it("treats a missing body as an empty envelope (400 invalid envelope), as before", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const req = new NextRequest("https://portfolio.test/monitoring", {
        method: "POST",
        headers: {
          origin: "https://portfolio.test",
          host: "portfolio.test",
          "x-forwarded-for": "10.9.1.1",
        },
      });

      const res = await POST(req);

      expect(res.status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("leaves no timer running after a prompt body and a successful relay", () =>
      withFakeTimers(async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({ status: 200, headers: new Headers() } as Response),
        );

        const res = await POST(makeReq(envelope(ALLOWED_DSN)));

        expect(res.status).toBe(200);
        expect(logWarn).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      }));
  });
});
