import { describe, it, expect, afterEach, vi } from "vitest";
import { checkRateLimit, getClientIp, isSameOrigin } from "../rate-limit";

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit", () => {
    const key = `under-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, { limit: 5, windowMs: 60_000 }).allowed).toBe(true);
    }
  });

  it("blocks requests over the limit", () => {
    const key = `over-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, { limit: 3, windowMs: 60_000 }).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("restores allowance after the window expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const key = `expire-${Math.random()}`;
    expect(checkRateLimit(key, { limit: 2, windowMs: 1000 }).allowed).toBe(true);
    expect(checkRateLimit(key, { limit: 2, windowMs: 1000 }).allowed).toBe(true);
    expect(checkRateLimit(key, { limit: 2, windowMs: 1000 }).allowed).toBe(false);
    vi.setSystemTime(1001);
    expect(checkRateLimit(key, { limit: 2, windowMs: 1000 }).allowed).toBe(true);
  });

  it("reports a retryAfterSeconds bounded by the window that shrinks over time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const key = `retry-${Math.random()}`;
    checkRateLimit(key, { limit: 1, windowMs: 60_000 });
    const blocked = checkRateLimit(key, { limit: 1, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);

    // Half-way through the window the retry hint drops accordingly.
    vi.setSystemTime(30_000);
    const later = checkRateLimit(key, { limit: 1, windowMs: 60_000 });
    expect(later.retryAfterSeconds).toBeGreaterThan(0);
    expect(later.retryAfterSeconds).toBeLessThanOrEqual(30);
  });

  it("prunes stale keys without breaking an active window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const active = `active-${Math.random()}`;
    // Record one hit for the active key under a long (60s) window.
    expect(checkRateLimit(active, { limit: 2, windowMs: 60_000 }).allowed).toBe(true);

    // Fill past the prune threshold with short-window keys that expire almost
    // immediately, so a later call triggers a prune pass.
    vi.setSystemTime(1);
    for (let i = 0; i < 5001; i++) {
      checkRateLimit(`stale-${i}`, { limit: 1, windowMs: 1 });
    }

    // The prune must drop the stale keys but keep the active key's still-open
    // window: its original t=0 hit still counts, so the 2nd hit is allowed and
    // the 3rd is blocked. If the active window had been wiped, both would pass.
    vi.setSystemTime(100);
    expect(checkRateLimit(active, { limit: 2, windowMs: 60_000 }).allowed).toBe(true);
    expect(checkRateLimit(active, { limit: 2, windowMs: 60_000 }).allowed).toBe(false);
  });
});

describe("getClientIp", () => {
  it("uses the first hop of x-forwarded-for", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" },
    });
    expect(getClientIp(req)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-real-ip": "198.51.100.5" },
    });
    expect(getClientIp(req)).toBe("198.51.100.5");
  });

  it('returns "unknown" when no forwarding headers are present', () => {
    const req = new Request("http://localhost/");
    expect(getClientIp(req)).toBe("unknown");
  });

  it("trims whitespace around the forwarded IP", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "  203.0.113.7  " },
    });
    expect(getClientIp(req)).toBe("203.0.113.7");
  });
});

describe("isSameOrigin", () => {
  it("accepts when the Origin host matches x-forwarded-host", () => {
    const req = new Request("http://localhost/api/leads", {
      method: "POST",
      headers: { origin: "https://amindhou.com", "x-forwarded-host": "amindhou.com" },
    });
    expect(isSameOrigin(req)).toBe(true);
  });

  it("accepts when the Origin host matches the Host header", () => {
    const req = new Request("http://localhost/api/leads", {
      method: "POST",
      headers: { origin: "http://localhost:3000", host: "localhost:3000" },
    });
    expect(isSameOrigin(req)).toBe(true);
  });

  it("rejects a cross-origin request", () => {
    const req = new Request("http://localhost/api/leads", {
      method: "POST",
      headers: { origin: "https://evil.example", "x-forwarded-host": "amindhou.com" },
    });
    expect(isSameOrigin(req)).toBe(false);
  });

  it("rejects a request with no Origin header", () => {
    const req = new Request("http://localhost/api/leads", {
      method: "POST",
      headers: { "x-forwarded-host": "amindhou.com" },
    });
    expect(isSameOrigin(req)).toBe(false);
  });

  it("rejects a request with a malformed Origin header", () => {
    const req = new Request("http://localhost/api/leads", {
      method: "POST",
      headers: { origin: "not-a-url", "x-forwarded-host": "amindhou.com" },
    });
    expect(isSameOrigin(req)).toBe(false);
  });
});
