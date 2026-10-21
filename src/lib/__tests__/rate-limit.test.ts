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
  const req = (headers: Record<string, string>) => new Request("http://localhost/", { headers });

  describe("CF-Connecting-IP", () => {
    it("keys on CF-Connecting-IP and ignores a spoofed leftmost x-forwarded-for", () => {
      expect(
        getClientIp(
          req({
            "cf-connecting-ip": "203.0.113.7",
            "x-forwarded-for": "6.6.6.6, 203.0.113.7, 172.18.0.2",
          }),
        ),
      ).toBe("203.0.113.7");
    });

    it("gives the same key however the x-forwarded-for prefix is spoofed", () => {
      const keys = new Set(
        ["1.1.1.1", "2.2.2.2, 3.3.3.3", "garbage", "::1"].map((spoof) =>
          getClientIp(
            req({
              "cf-connecting-ip": "203.0.113.7",
              "x-forwarded-for": `${spoof}, 203.0.113.7, 172.18.0.2`,
            }),
          ),
        ),
      );
      expect([...keys]).toEqual(["203.0.113.7"]);
    });

    it("accepts an IPv6 address", () => {
      expect(getClientIp(req({ "cf-connecting-ip": "2001:db8::1" }))).toBe("2001:db8::1");
    });

    it("trims whitespace", () => {
      expect(getClientIp(req({ "cf-connecting-ip": "  203.0.113.7  " }))).toBe("203.0.113.7");
    });

    it.each([
      ["a hostname", "evil.example"],
      ["an IPv6 zone id", "fe80::1%eth0"],
      ["a list", "203.0.113.7, 198.51.100.1"],
      ["an over-long value", `${"1".repeat(60)}`],
      ["an out-of-range octet", "256.1.1.1"],
    ])("ignores %s and falls through to the next source", (_label, bad) => {
      expect(
        getClientIp(req({ "cf-connecting-ip": bad, "x-forwarded-for": "9.9.9.9, 198.51.100.5" })),
      ).toBe("198.51.100.5");
    });
  });

  describe("x-forwarded-for without CF-Connecting-IP", () => {
    it("keys on the RIGHTMOST hop, the one the nearest proxy appended", () => {
      expect(
        getClientIp(req({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" })),
      ).toBe("150.172.238.178");
    });

    it("does not create a new key per request when the client rotates the leftmost entry", () => {
      const keys = new Set<string>();
      for (let i = 0; i < 50; i++) {
        keys.add(getClientIp(req({ "x-forwarded-for": `10.200.0.${i}, 198.51.100.5` })));
      }
      expect([...keys]).toEqual(["198.51.100.5"]);
    });

    it("trims whitespace around the hop", () => {
      expect(getClientIp(req({ "x-forwarded-for": "  203.0.113.7  " }))).toBe("203.0.113.7");
    });

    it("accepts an IPv6 hop", () => {
      expect(getClientIp(req({ "x-forwarded-for": "9.9.9.9, 2001:db8::5" }))).toBe("2001:db8::5");
    });

    it("never skips a bad rightmost entry to reach a client-chosen one", () => {
      // A rightmost entry that is not an address means no proxy appended it, so everything to
      // its left is client-controlled.
      expect(
        getClientIp(req({ "x-forwarded-for": "6.6.6.6, not-an-ip", "x-real-ip": "198.51.100.9" })),
      ).toBe("198.51.100.9");
      expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6, fe80::1%eth0" }))).toBe("unknown");
    });

    it("ignores a trailing comma (empty rightmost entry)", () => {
      expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6," }))).toBe("unknown");
    });
  });

  describe("x-real-ip and unknown", () => {
    it("falls back to x-real-ip when x-forwarded-for is absent", () => {
      expect(getClientIp(req({ "x-real-ip": "198.51.100.5" }))).toBe("198.51.100.5");
    });

    it("ignores an invalid x-real-ip", () => {
      expect(getClientIp(req({ "x-real-ip": "198.51.100.5%eth0" }))).toBe("unknown");
      expect(getClientIp(req({ "x-real-ip": "<script>" }))).toBe("unknown");
    });

    it('returns "unknown" when no forwarding headers are present', () => {
      expect(getClientIp(new Request("http://localhost/"))).toBe("unknown");
    });
  });
});

describe("bucket cap", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const opts = { limit: 1, windowMs: 3_600_000 };

  it("evicts the oldest live keys once a flood of unique keys passes the cap", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const tag = `flood-${Math.random()}`;
    expect(checkRateLimit(`${tag}-first`, opts).allowed).toBe(true);
    expect(checkRateLimit(`${tag}-first`, opts).allowed).toBe(false);

    for (let i = 0; i < 12_000; i++) {
      checkRateLimit(`${tag}-${i}`, opts);
    }

    // The oldest bucket was dropped to keep the map bounded, so it starts a fresh budget...
    expect(checkRateLimit(`${tag}-first`, opts).allowed).toBe(true);
    // ...while a recent bucket is still enforced.
    expect(checkRateLimit(`${tag}-11999`, opts).allowed).toBe(false);
  });

  it("drops expired keys before evicting live ones when the cap is reached", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const tag = `expiry-${Math.random()}`;
    const live = `${tag}-live`;
    expect(checkRateLimit(live, opts).allowed).toBe(true);

    vi.setSystemTime(1);
    for (let i = 0; i < 9_000; i++) {
      checkRateLimit(`${tag}-short-${i}`, { limit: 1, windowMs: 1 });
    }
    vi.setSystemTime(2_000);
    for (let i = 0; i < 9_000; i++) {
      checkRateLimit(`${tag}-next-${i}`, { limit: 1, windowMs: 1 });
    }

    // 18k keys went through but the 9k short-window ones had expired, so the live key was never
    // the oldest-and-live victim: its one-hit budget is still spent.
    expect(checkRateLimit(live, opts).allowed).toBe(false);
  });

  it("does not rescan the whole map on every request while it is over the prune threshold", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000_000);
    const tag = `scan-${Math.random()}`;
    // 6000 live keys sit above the prune threshold; none is expired, so a prune frees nothing.
    for (let i = 0; i < 6_000; i++) checkRateLimit(`${tag}-${i}`, opts);

    const spy = vi.spyOn(Map.prototype, "entries");
    const iter = vi.spyOn(Map.prototype, Symbol.iterator as unknown as "entries");
    try {
      for (let i = 0; i < 200; i++) checkRateLimit(`${tag}-more-${i}`, opts);
      // At most one throttled prune pass for the whole burst (all at the same instant).
      expect(spy.mock.calls.length + iter.mock.calls.length).toBeLessThanOrEqual(1);
    } finally {
      spy.mockRestore();
      iter.mockRestore();
    }
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
