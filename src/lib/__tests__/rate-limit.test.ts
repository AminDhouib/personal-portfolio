import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The real log module runs on purpose: mocking it would make "never reaches Sentry or PostHog"
// pass whatever the code under test calls. Only the outermost sinks are replaced.
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  withScope: vi.fn((callback: (scope: { setTag: () => void }) => void) =>
    callback({ setTag: vi.fn() }),
  ),
}));

import * as Sentry from "@sentry/nextjs";
import { checkRateLimit, getClientIp, isSameOrigin, resetRateLimitForTests } from "../rate-limit";

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

// Module state (the bucket map, the missing-header warning throttle) must not leak between tests.
beforeEach(() => {
  resetRateLimitForTests();
  vi.mocked(Sentry.captureException).mockClear();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

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

    it("buckets an IPv6 address by its /64", () => {
      expect(getClientIp(req({ "cf-connecting-ip": "2001:db8::1" }))).toBe("2001:db8:0:0::/64");
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

    it("buckets an IPv6 hop by its /64", () => {
      expect(getClientIp(req({ "x-forwarded-for": "9.9.9.9, 2001:db8::5" }))).toBe(
        "2001:db8:0:0::/64",
      );
    });

    it("never skips a bad rightmost entry to reach a client-chosen one", () => {
      // A rightmost entry that is not an address means no proxy appended it, so everything to
      // its left is client-controlled.
      expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6, not-an-ip" }))).toBe("unknown");
      expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6, fe80::1%eth0" }))).toBe("unknown");
    });

    it("ignores a trailing comma (empty rightmost entry)", () => {
      expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6," }))).toBe("unknown");
    });
  });

  describe("nothing usable", () => {
    it("ignores x-real-ip: the Next server always supplies x-forwarded-for, so it is never needed", () => {
      expect(getClientIp(req({ "x-real-ip": "198.51.100.5" }))).toBe("unknown");
    });

    it('returns "unknown" when no forwarding headers are present', () => {
      expect(getClientIp(new Request("http://localhost/"))).toBe("unknown");
    });
  });

  describe("IPv6 canonicalisation", () => {
    const viaCf = (ip: string) => getClientIp(req({ "cf-connecting-ip": ip }));

    it("gives two addresses in one /64 the same key", () => {
      expect(viaCf("2001:db8:1:2::1")).toBe(viaCf("2001:0db8:0001:0002:ffff:ffff:ffff:ffff"));
    });

    it("gives every spelling of one /64 the same key", () => {
      const keys = new Set(
        [
          "2001:db8:1:2::",
          "2001:DB8:1:2::abcd",
          "2001:db8:1:2:0:0:0:1",
          "2001:db8:1:2:1:2:3:4",
          "2001:0db8:0001:0002::",
        ].map(viaCf),
      );
      expect([...keys]).toEqual(["2001:db8:1:2::/64"]);
    });

    it("gives different /64s different keys", () => {
      expect(viaCf("2001:db8:1:2::1")).not.toBe(viaCf("2001:db8:1:3::1"));
      expect(viaCf("2001:db8:1:2::1")).not.toBe(viaCf("2001:db8:2:2::1"));
      expect(viaCf("2001:db8:1:2::1")).not.toBe(viaCf("2002:db8:1:2::1"));
    });

    it("does not let rotating the host half of a v6 address mint new buckets", () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) keys.add(viaCf(`2001:db8:aa:bb::${i.toString(16)}:${i}`));
      expect(keys.size).toBe(1);
    });

    it("expands an embedded-IPv4 tail before taking the /64", () => {
      expect(viaCf("64:ff9b::1.2.3.4")).toBe("64:ff9b:0:0::/64");
      expect(viaCf("2001:db8:1:2::1.2.3.4")).toBe(viaCf("2001:db8:1:2::9"));
    });

    it("handles the unspecified and loopback addresses", () => {
      expect(viaCf("::")).toBe("0:0:0:0::/64");
      expect(viaCf("::1")).toBe("0:0:0:0::/64");
    });

    it("maps an IPv4-mapped address onto the plain IPv4 key", () => {
      expect(viaCf("::ffff:203.0.113.7")).toBe("203.0.113.7");
      expect(viaCf("::FFFF:203.0.113.7")).toBe("203.0.113.7");
      expect(viaCf("0:0:0:0:0:ffff:cb00:7107")).toBe("203.0.113.7");
      expect(viaCf("::ffff:cb00:7107")).toBe(viaCf("203.0.113.7"));
    });

    it("keeps IPv4 as a full address, never grouped", () => {
      expect(viaCf("203.0.113.7")).toBe("203.0.113.7");
      expect(viaCf("203.0.113.7")).not.toBe(viaCf("203.0.113.8"));
    });

    it("canonicalises the x-forwarded-for fallback the same way", () => {
      expect(getClientIp(req({ "x-forwarded-for": "1.1.1.1, ::ffff:198.51.100.5" }))).toBe(
        "198.51.100.5",
      );
      expect(getClientIp(req({ "x-forwarded-for": "1.1.1.1, 2001:db8:1:2::77" }))).toBe(
        "2001:db8:1:2::/64",
      );
    });
  });

  describe("missing CF-Connecting-IP warning", () => {
    const WARN_INTERVAL_MS = 60_000;
    const noCf = () => req({ "x-forwarded-for": "198.51.100.5" });

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      vi.stubEnv("NODE_ENV", "production");
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("logs a structured warning through logWarn when the header is missing in production", () => {
      getClientIp(noCf());
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const line = String(warnSpy.mock.calls[0]?.[0]);
      expect(line).toMatch(/^\[rate-limit\] .*CF-Connecting-IP/);
      expect(line).toContain('{"fallback":"x-forwarded-for"}');
    });

    it("reports the fallback in use and never logs an address", () => {
      getClientIp(new Request("http://localhost/"));
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('{"fallback":"unknown"}');
      vi.setSystemTime(1_000_000 + WARN_INTERVAL_MS);
      getClientIp(req({ "cf-connecting-ip": "not-an-ip", "x-forwarded-for": "198.51.100.5" }));
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("198.51.100.5");
    });

    it("warns at most once per minute however many requests arrive", () => {
      for (let i = 0; i < 500; i++) getClientIp(noCf());
      expect(warnSpy).toHaveBeenCalledTimes(1);

      vi.setSystemTime(1_000_000 + WARN_INTERVAL_MS - 1);
      getClientIp(noCf());
      expect(warnSpy).toHaveBeenCalledTimes(1);

      vi.setSystemTime(1_000_000 + WARN_INTERVAL_MS);
      for (let i = 0; i < 500; i++) getClientIp(noCf());
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it("does not warn when a valid CF-Connecting-IP is present", () => {
      getClientIp(req({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.5" }));
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("does not warn outside production", () => {
      vi.stubEnv("NODE_ENV", "development");
      getClientIp(noCf());
      vi.stubEnv("NODE_ENV", "test");
      getClientIp(noCf());
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("never reaches Sentry or PostHog: the real logger runs and only console.warn fires", () => {
      vi.setSystemTime(1_000_000);
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(1_000_000 + i * WARN_INTERVAL_MS);
        getClientIp(noCf());
      }
      expect(warnSpy).toHaveBeenCalledTimes(5);
      // log.ts captureException logs through console.error AND calls Sentry; neither happened.
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.withScope).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("starts a fresh throttle window after the module state is reset", () => {
      getClientIp(noCf());
      resetRateLimitForTests();
      getClientIp(noCf());
      expect(warnSpy).toHaveBeenCalledTimes(2);
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
