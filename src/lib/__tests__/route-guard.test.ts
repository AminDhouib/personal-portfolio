import { describe, it, expect } from "vitest";
import { guardRequest, guardedJsonRoute } from "../route-guard";

let ipCounter = 0;
function uniqueIp(): string {
  ipCounter += 1;
  return `10.55.${Math.floor(ipCounter / 256) % 256}.${ipCounter % 256}`;
}

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
    expect(res?.status).toBe(403);
  });

  it("returns a 403 for a foreign Origin", () => {
    const res = guardRequest(makeReq({ origin: "https://evil.example" }), {
      key: "rg-test-b",
      limit: 10,
      windowMs: 60_000,
    });
    expect(res?.status).toBe(403);
  });

  it("returns null (pass) for a same-origin request within the limit", () => {
    const res = guardRequest(makeReq(), { key: "rg-test-c", limit: 10, windowMs: 60_000 });
    expect(res).toBeNull();
  });

  it("returns a 429 with Retry-After once the per-key limit is exceeded", () => {
    const ip = uniqueIp();
    for (let i = 0; i < 3; i++) {
      const res = guardRequest(makeReq({ ip }), { key: "rg-test-d", limit: 3, windowMs: 60_000 });
      expect(res).toBeNull();
    }
    const limited = guardRequest(makeReq({ ip }), {
      key: "rg-test-d",
      limit: 3,
      windowMs: 60_000,
    });
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("Retry-After")).toBeTruthy();
  });

  it("never reads the request body (safe in front of a handler that reads it itself)", async () => {
    const req = makeReq({ body: { a: 1 } });
    guardRequest(req, { key: "rg-test-e", limit: 10, windowMs: 60_000 });
    expect(req.bodyUsed).toBe(false);
    // the body must still be readable exactly once by the real caller downstream
    await expect(req.json()).resolves.toEqual({ a: 1 });
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
    if (guard.ok) expect(guard.body).toEqual({ hello: "world" });
  });
});
