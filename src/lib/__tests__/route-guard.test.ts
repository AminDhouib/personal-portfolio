import { describe, it, expect } from "vitest";
import { guardRequest, guardedJsonRoute } from "../route-guard";
import { uniqueIp } from "@/test/api-route-helpers";

function makeReq(
  opts: { ip?: string; origin?: string | null; host?: string; body?: unknown } = {},
): Request {
  const headers: Record<string, string> = {};
  const origin = opts.origin === undefined ? "https://amindhou.com" : opts.origin;
  if (origin) headers["origin"] = origin;
  headers["x-forwarded-host"] = opts.host ?? "amindhou.com";
  headers["x-forwarded-for"] = opts.ip ?? uniqueIp();
  return new Request("https://amindhou.com/api/test", {
    method: "POST",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

describe("guardRequest", () => {
  it("returns a 403 for a missing Origin header", () => {
    const res = guardRequest(makeReq({ origin: null }), {
      key: "rg-test-a",
      limit: 10,
      windowMs: 60_000,
    });
    expect(res.response?.status).toBe(403);
  });

  it("returns a 403 for a foreign Origin", () => {
    const res = guardRequest(makeReq({ origin: "https://evil.example" }), {
      key: "rg-test-b",
      limit: 10,
      windowMs: 60_000,
    });
    expect(res.response?.status).toBe(403);
  });

  it("returns null (pass) for a same-origin request within the limit", () => {
    const res = guardRequest(makeReq(), { key: "rg-test-c", limit: 10, windowMs: 60_000 });
    expect(res.response).toBeNull();
  });

  it("returns a 429 with Retry-After once the per-key limit is exceeded", () => {
    const ip = uniqueIp();
    for (let i = 0; i < 3; i++) {
      const res = guardRequest(makeReq({ ip }), { key: "rg-test-d", limit: 3, windowMs: 60_000 });
      expect(res.response).toBeNull();
    }
    const limited = guardRequest(makeReq({ ip }), {
      key: "rg-test-d",
      limit: 3,
      windowMs: 60_000,
    });
    expect(limited.response?.status).toBe(429);
    expect(limited.response?.headers.get("Retry-After")).toBeTruthy();
  });

  it("never reads the request body (safe in front of a handler that reads it itself)", async () => {
    const req = makeReq({ body: { a: 1 } });
    guardRequest(req, { key: "rg-test-e", limit: 10, windowMs: 60_000 });
    expect(req.bodyUsed).toBe(false);
    // the body must still be readable exactly once by the real caller downstream
    await expect(req.json()).resolves.toEqual({ a: 1 });
  });

  it("returns a uuid requestId on the guard result", () => {
    const res = guardRequest(makeReq(), { key: "rg-test-f", limit: 10, windowMs: 60_000 });
    expect(res.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe("guardedJsonRoute", () => {
  it("short-circuits with the guardRequest response on cross-origin", async () => {
    const guard = await guardedJsonRoute(makeReq({ origin: "https://evil.example" }), {
      key: "gjr-test-a",
      limit: 10,
      windowMs: 60_000,
    });
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(403);
  });

  it("short-circuits with the guardRequest response once rate-limited", async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 2; i++) {
      const guard = await guardedJsonRoute(makeReq({ ip, body: {} }), {
        key: "gjr-test-b",
        limit: 2,
        windowMs: 60_000,
      });
      expect(guard.ok).toBe(true);
    }
    const limited = await guardedJsonRoute(makeReq({ ip, body: {} }), {
      key: "gjr-test-b",
      limit: 2,
      windowMs: 60_000,
    });
    expect(limited.ok).toBe(false);
    if (!limited.ok) expect(limited.response.status).toBe(429);
  });

  it("returns 400 invalid json for a malformed body", async () => {
    const req = new Request("https://amindhou.com/api/test", {
      method: "POST",
      headers: { origin: "https://amindhou.com", "x-forwarded-host": "amindhou.com" },
      body: "{not json",
    });
    const guard = await guardedJsonRoute(req, { key: "gjr-test-c", limit: 10, windowMs: 60_000 });
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(400);
  });

  it("returns ok:true with the parsed body on a valid request", async () => {
    const guard = await guardedJsonRoute(makeReq({ body: { hello: "world" } }), {
      key: "gjr-test-d",
      limit: 10,
      windowMs: 60_000,
    });
    expect(guard.ok).toBe(true);
    if (guard.ok) {
      expect(guard.body).toEqual({ hello: "world" });
      expect(guard.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
  });
});

describe("guardedJsonRoute body-size cap", () => {
  const DEFAULT_CAP = 16 * 1024;

  it("allows a body exactly at the default 16 KiB cap (happy path unchanged)", async () => {
    const filler = "x".repeat(DEFAULT_CAP - 8); // `{"a":"` + filler + `"}` = DEFAULT_CAP bytes
    const body = `{"a":"${filler}"}`;
    expect(Buffer.byteLength(body, "utf8")).toBe(DEFAULT_CAP);
    const req = new Request("https://amindhou.com/api/test", {
      method: "POST",
      headers: { origin: "https://amindhou.com", "x-forwarded-host": "amindhou.com" },
      body,
    });
    const guard = await guardedJsonRoute(req, { key: "gjr-cap-a", limit: 10, windowMs: 60_000 });
    expect(guard.ok).toBe(true);
    if (guard.ok) expect((guard.body as { a: string }).a).toHaveLength(DEFAULT_CAP - 8);
  });

  it("413s a body one byte over the default cap (no explicit maxBytes)", async () => {
    const filler = "x".repeat(DEFAULT_CAP - 7); // one byte over DEFAULT_CAP
    const req = new Request("https://amindhou.com/api/test", {
      method: "POST",
      headers: { origin: "https://amindhou.com", "x-forwarded-host": "amindhou.com" },
      body: `{"a":"${filler}"}`,
    });
    const guard = await guardedJsonRoute(req, { key: "gjr-cap-b", limit: 10, windowMs: 60_000 });
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(413);
  });

  it("returns 413 without reading the body when Content-Length declares over the cap", async () => {
    const req = new Request("https://amindhou.com/api/test", {
      method: "POST",
      headers: {
        origin: "https://amindhou.com",
        "x-forwarded-host": "amindhou.com",
        "content-length": "999999",
      },
      body: "short",
    });
    const guard = await guardedJsonRoute(req, {
      key: "gjr-cap-c",
      limit: 10,
      windowMs: 60_000,
      maxBytes: 20,
    });
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(413);
    expect(req.bodyUsed).toBe(false);
  });

  it("returns 413 after reading when Content-Length is absent but the actual bytes exceed the cap", async () => {
    const req = new Request("https://amindhou.com/api/test", {
      method: "POST",
      headers: { origin: "https://amindhou.com", "x-forwarded-host": "amindhou.com" },
      body: "x".repeat(50),
    });
    const guard = await guardedJsonRoute(req, {
      key: "gjr-cap-d",
      limit: 10,
      windowMs: 60_000,
      maxBytes: 20,
    });
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(413);
    expect(req.bodyUsed).toBe(true);
  });

  it("returns 413 after reading when Content-Length understates the actual bytes (lying-low header)", async () => {
    const req = new Request("https://amindhou.com/api/test", {
      method: "POST",
      headers: {
        origin: "https://amindhou.com",
        "x-forwarded-host": "amindhou.com",
        "content-length": "5",
      },
      body: "x".repeat(50),
    });
    const guard = await guardedJsonRoute(req, {
      key: "gjr-cap-e",
      limit: 10,
      windowMs: 60_000,
      maxBytes: 20,
    });
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(413);
    expect(req.bodyUsed).toBe(true);
  });

  it("returns 400 for malformed JSON under the cap (size check does not shadow parse errors)", async () => {
    const req = new Request("https://amindhou.com/api/test", {
      method: "POST",
      headers: { origin: "https://amindhou.com", "x-forwarded-host": "amindhou.com" },
      body: "{not json",
    });
    const guard = await guardedJsonRoute(req, {
      key: "gjr-cap-f",
      limit: 10,
      windowMs: 60_000,
      maxBytes: 20,
    });
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(400);
  });

  it("rejects a cross-origin over-cap body with 403 (origin wins over size)", async () => {
    const req = new Request("https://amindhou.com/api/test", {
      method: "POST",
      headers: { origin: "https://evil.example", "x-forwarded-host": "amindhou.com" },
      body: "x".repeat(50),
    });
    const guard = await guardedJsonRoute(req, {
      key: "gjr-cap-g",
      limit: 10,
      windowMs: 60_000,
      maxBytes: 20,
    });
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(403);
  });

  it("rejects an over-cap body with 429 once already rate-limited (rate wins over size)", async () => {
    const ip = uniqueIp();
    const key = "gjr-cap-h";
    for (let i = 0; i < 2; i++) {
      const guard = await guardedJsonRoute(makeReq({ ip, body: {} }), {
        key,
        limit: 2,
        windowMs: 60_000,
        maxBytes: 20,
      });
      expect(guard.ok).toBe(true);
    }
    const req = new Request("https://amindhou.com/api/test", {
      method: "POST",
      headers: {
        origin: "https://amindhou.com",
        "x-forwarded-host": "amindhou.com",
        "x-forwarded-for": ip,
      },
      body: "x".repeat(50),
    });
    const guard = await guardedJsonRoute(req, { key, limit: 2, windowMs: 60_000, maxBytes: 20 });
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(429);
  });
});

describe("guardRequest client identity (T-5524)", () => {
  /** A same-origin POST as it arrives behind Cloudflare: CF-Connecting-IP plus a client-typed XFF. */
  function behindCloudflare(cfIp: string, spoofedLeftmost: string): Request {
    return new Request("https://amindhou.com/api/test", {
      method: "POST",
      headers: {
        origin: "https://amindhou.com",
        "x-forwarded-host": "amindhou.com",
        "cf-connecting-ip": cfIp,
        "x-forwarded-for": `${spoofedLeftmost}, ${cfIp}, 172.18.0.2`,
      },
    });
  }

  it("keeps answering 429 for an exhausted CF-Connecting-IP while X-Forwarded-For rotates", () => {
    const cfIp = uniqueIp();
    const opts = { key: "rg-cf-spoof", limit: 3, windowMs: 60_000 };

    for (let i = 0; i < 3; i++) {
      expect(guardRequest(behindCloudflare(cfIp, `203.0.113.${i + 1}`), opts).response).toBeNull();
    }
    for (let i = 0; i < 20; i++) {
      const res = guardRequest(behindCloudflare(cfIp, `198.51.100.${i + 1}`), opts);
      expect(res.response?.status).toBe(429);
    }
  });

  it("still gives a different CF-Connecting-IP its own budget", () => {
    const opts = { key: "rg-cf-separate", limit: 1, windowMs: 60_000 };
    const first = uniqueIp();
    expect(guardRequest(behindCloudflare(first, "6.6.6.6"), opts).response).toBeNull();
    expect(guardRequest(behindCloudflare(first, "6.6.6.7"), opts).response?.status).toBe(429);
    expect(guardRequest(behindCloudflare(uniqueIp(), "6.6.6.6"), opts).response).toBeNull();
  });

  it("does not let a rotating leftmost X-Forwarded-For escape the limit without a CF header", () => {
    const opts = { key: "rg-no-cf-spoof", limit: 2, windowMs: 60_000 };
    const hop = uniqueIp();
    const make = (leftmost: string) =>
      new Request("https://amindhou.com/api/test", {
        method: "POST",
        headers: {
          origin: "https://amindhou.com",
          "x-forwarded-host": "amindhou.com",
          "x-forwarded-for": `${leftmost}, ${hop}`,
        },
      });
    expect(guardRequest(make("1.1.1.1"), opts).response).toBeNull();
    expect(guardRequest(make("2.2.2.2"), opts).response).toBeNull();
    expect(guardRequest(make("3.3.3.3"), opts).response?.status).toBe(429);
    expect(guardRequest(make("4.4.4.4"), opts).response?.status).toBe(429);
  });
});

describe("guardedJsonRoute chunked bodies (T-5526)", () => {
  // A chunked upload carries no Content-Length, so the declared-size pre-check cannot see it.
  // The body read itself must stop at the cap instead of buffering the whole upload first.
  function chunkedRequest(chunkCount: number, observe: { pulls: number }): Request {
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        observe.pulls += 1;
        if (sent >= chunkCount) {
          controller.close();
          return;
        }
        sent += 1;
        controller.enqueue(new Uint8Array(1024).fill(120));
      },
    });
    return new Request("https://amindhou.com/api/test", {
      method: "POST",
      headers: { origin: "https://amindhou.com", "x-forwarded-host": "amindhou.com" },
      body,
      duplex: "half",
    } as RequestInit);
  }

  it("413s a chunked body past the cap without pulling the rest of the stream", async () => {
    const observe = { pulls: 0 };
    const req = chunkedRequest(10_000, observe);
    expect(req.headers.get("content-length")).toBeNull();

    const guard = await guardedJsonRoute(req, {
      key: "gjr-chunked-a",
      limit: 10,
      windowMs: 60_000,
      maxBytes: 4096,
    });

    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(413);
    expect(observe.pulls).toBeLessThan(20);
  });

  it("still parses a chunked body under the cap", async () => {
    const encoder = new TextEncoder();
    const parts = [encoder.encode('{"hello"'), encoder.encode(':"world"}')];
    let index = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = parts[index];
        index += 1;
        if (next === undefined) controller.close();
        else controller.enqueue(next);
      },
    });
    const req = new Request("https://amindhou.com/api/test", {
      method: "POST",
      headers: { origin: "https://amindhou.com", "x-forwarded-host": "amindhou.com" },
      body,
      duplex: "half",
    } as RequestInit);

    const guard = await guardedJsonRoute(req, {
      key: "gjr-chunked-b",
      limit: 10,
      windowMs: 60_000,
    });
    expect(guard.ok).toBe(true);
    if (guard.ok) expect(guard.body).toEqual({ hello: "world" });
  });

  it("answers 400 invalid json, not a crash, when the stream errors mid-body", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
      },
      pull(controller) {
        controller.error(new Error("socket reset"));
      },
    });
    const req = new Request("https://amindhou.com/api/test", {
      method: "POST",
      headers: { origin: "https://amindhou.com", "x-forwarded-host": "amindhou.com" },
      body,
      duplex: "half",
    } as RequestInit);

    const guard = await guardedJsonRoute(req, {
      key: "gjr-chunked-c",
      limit: 10,
      windowMs: 60_000,
    });
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(400);
  });
});
