import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { logWarn, logError } from "../log";

const mockCaptureException = vi.hoisted(() => vi.fn());
const mockPostHogCtor = vi.hoisted(() => vi.fn());

const mockWithScope = vi.hoisted(() => vi.fn());
const mockSentryCapture = vi.hoisted(() => vi.fn());
const mockSetTag = vi.hoisted(() => vi.fn());

// A null-prototype object whose toJSON throws: JSON.stringify throws and so does
// String() (no toString on the prototype chain).
function unrenderable(): unknown {
  const bad = Object.create(null) as Record<string, unknown>;
  bad.toJSON = () => {
    throw new Error("no json");
  };
  return bad;
}

vi.mock("@sentry/nextjs", () => ({
  withScope: mockWithScope,
  captureException: mockSentryCapture,
}));

vi.mock("posthog-node", () => ({
  PostHog: class MockPostHog {
    constructor(...args: unknown[]) {
      mockPostHogCtor(...args);
    }
    captureException = mockCaptureException;
  },
}));

describe("logWarn / logError", () => {
  it("logWarn writes a single console.warn line including scope and message", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logWarn("github", "fetchRepoStats failed");
    expect(spy).toHaveBeenCalledOnce();
    const call = spy.mock.calls[0];
    if (!call) throw new Error("expected console.warn to have been called");
    const [line] = call;
    expect(line).toContain("[github]");
    expect(line).toContain("fetchRepoStats failed");
    spy.mockRestore();
  });

  it("logWarn renders an Error detail as message + first stack line, not a raw dump", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = new Error("boom");
    logWarn("ga4", "runReport failed", err);
    expect(spy).toHaveBeenCalledOnce();
    const [line] = spy.mock.calls[0] as [string];
    expect(typeof line).toBe("string");
    expect(line).toContain("boom");
    // Single line: no embedded newlines from a full stack dump.
    expect(line.includes("\n")).toBe(false);
    spy.mockRestore();
  });

  it("logError writes a single console.error line including scope and message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("leaderboard", "read failed", new Error("disk full"));
    expect(spy).toHaveBeenCalledOnce();
    const [line] = spy.mock.calls[0] as [string];
    expect(line).toContain("[leaderboard]");
    expect(line).toContain("read failed");
    expect(line).toContain("disk full");
    spy.mockRestore();
  });

  it("logError never throws when the detail cannot be stringified or converted", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => logError("scope", "bad detail", unrenderable())).not.toThrow();
    const [line] = spy.mock.calls[0] as [string];
    expect(line).toBe("[scope] bad detail :: [unrenderable detail]");
    spy.mockRestore();
  });

  it("logError never throws when an Error stack getter throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const err = new Error("boom");
      Object.defineProperty(err, "stack", {
        get() {
          throw new Error("stack exploded");
        },
      });
      expect(() => logError("scope", "bad stack", err)).not.toThrow();
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
  });

  it("logError still logs the message when an Error stack is not a string", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const err = new Error("boom");
      (err as unknown as { stack: unknown }).stack = 123;
      expect(() => logError("scope", "numeric stack", err)).not.toThrow();
      const [line] = spy.mock.calls[0] as [string];
      expect(line).toContain("boom");
    } finally {
      spy.mockRestore();
    }
  });

  it("logWarn renders a function detail as a string instead of undefined", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logWarn("scope", "fn detail", function named() {});
    const [line] = spy.mock.calls[0] as [string];
    expect(line).toContain("[scope] fn detail :: ");
    expect(line).not.toContain("undefined");
    spy.mockRestore();
  });

  it("omits the detail suffix entirely when no detail is passed", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logWarn("scope", "just a message");
    const [line] = spy.mock.calls[0] as [string];
    expect(line).toBe("[scope] just a message");
    spy.mockRestore();
  });
});

// captureException reloads the module fresh (vi.resetModules + dynamic import)
// in every test. The module memoizes its PostHog client as a module-level
// singleton, so reusing one static import across these tests would let an
// earlier test's env config (or constructed client) leak into a later test.
describe("captureException", () => {
  let savedKey: string | undefined;
  let savedHost: string | undefined;

  beforeEach(() => {
    savedKey = process.env.POSTHOG_KEY;
    savedHost = process.env.POSTHOG_HOST;
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    mockCaptureException.mockReset();
    mockPostHogCtor.mockReset();
    mockWithScope.mockReset();
    mockSentryCapture.mockReset();
    mockSetTag.mockReset();
    mockWithScope.mockImplementation((cb: (scope: { setTag: typeof mockSetTag }) => void) =>
      cb({ setTag: mockSetTag }),
    );
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env.POSTHOG_KEY;
    else process.env.POSTHOG_KEY = savedKey;
    if (savedHost === undefined) delete process.env.POSTHOG_HOST;
    else process.env.POSTHOG_HOST = savedHost;
  });

  it("is a no-op (no client constructed, no network) when env is not configured", async () => {
    vi.resetModules();
    const { captureException } = await import("../log");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => captureException("leads.persist", new Error("disk full"))).not.toThrow();
    expect(mockPostHogCtor).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
    // Still logs locally even when PostHog isn't configured.
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it("stays a no-op when only one of POSTHOG_KEY/POSTHOG_HOST is set", async () => {
    process.env.POSTHOG_KEY = "phc_test";
    vi.resetModules();
    const { captureException } = await import("../log");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => captureException("leads.email", new Error("email provider down"))).not.toThrow();
    expect(mockPostHogCtor).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("sends an exception event tagged with scope when both env vars are set", async () => {
    process.env.POSTHOG_KEY = "phc_test";
    process.env.POSTHOG_HOST = "https://posthog.example.com";
    vi.resetModules();
    const { captureException } = await import("../log");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const err = new Error("read failed");
    captureException("leaderboard", err);

    expect(mockPostHogCtor).toHaveBeenCalledOnce();
    expect(mockPostHogCtor).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        host: "https://posthog.example.com",
        flushAt: 1,
        flushInterval: 0,
      }),
    );
    expect(mockCaptureException).toHaveBeenCalledOnce();
    const call = mockCaptureException.mock.calls[0];
    if (!call) throw new Error("expected captureException to have been called");
    const [capturedError, distinctId, properties] = call;
    expect(capturedError).toBe(err);
    expect(distinctId).toBe("server");
    expect(properties).toMatchObject({ scope: "leaderboard" });
    errorSpy.mockRestore();
  });

  it("never throws even if the underlying PostHog capture call throws", async () => {
    process.env.POSTHOG_KEY = "phc_test";
    process.env.POSTHOG_HOST = "https://posthog.example.com";
    mockCaptureException.mockImplementation(() => {
      throw new Error("network unreachable");
    });
    vi.resetModules();
    const { captureException } = await import("../log");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => captureException("leaderboard", new Error("read failed"))).not.toThrow();
    expect(mockCaptureException).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it("never throws when the Sentry SDK throws, still logs both failures and still reaches PostHog", async () => {
    process.env.POSTHOG_KEY = "phc_test";
    process.env.POSTHOG_HOST = "https://posthog.example.com";
    mockWithScope.mockImplementation(() => {
      throw new Error("sentry exploded");
    });
    vi.resetModules();
    const { captureException } = await import("../log");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const err = new Error("pool dropped");
    expect(() => captureException("db.pool", err)).not.toThrow();

    const lines = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes("[db.pool]") && l.includes("pool dropped"))).toBe(true);
    expect(lines.some((l) => l.includes("[sentry]") && l.includes("sentry exploded"))).toBe(true);
    expect(mockCaptureException).toHaveBeenCalledOnce();
    expect(mockCaptureException.mock.calls[0]?.[0]).toBe(err);
    errorSpy.mockRestore();
  });

  it("never throws for a non-Error whose rendering throws, and still reaches Sentry and PostHog", async () => {
    process.env.POSTHOG_KEY = "phc_test";
    process.env.POSTHOG_HOST = "https://posthog.example.com";
    vi.resetModules();
    const { captureException } = await import("../log");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => captureException("db.pool", unrenderable())).not.toThrow();
    expect(mockWithScope).toHaveBeenCalledOnce();
    expect(mockSentryCapture).toHaveBeenCalledOnce();
    expect(mockCaptureException).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it("tags the Sentry scope and captures the same Error on the happy path", async () => {
    vi.resetModules();
    const { captureException } = await import("../log");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const err = new Error("boom");
    captureException("some:scope", err);

    expect(mockWithScope).toHaveBeenCalledOnce();
    expect(mockSetTag).toHaveBeenCalledWith("scope", "some:scope");
    expect(mockSentryCapture).toHaveBeenCalledOnce();
    expect(mockSentryCapture.mock.calls[0]?.[0]).toBe(err);
    errorSpy.mockRestore();
  });

  it("never throws for a revoked Proxy, and still reaches Sentry and PostHog", async () => {
    process.env.POSTHOG_KEY = "phc_test";
    process.env.POSTHOG_HOST = "https://posthog.example.com";
    vi.resetModules();
    const { captureException } = await import("../log");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { proxy, revoke } = Proxy.revocable({}, {});
      revoke();
      expect(() => captureException("db.pool", proxy)).not.toThrow();
      expect(mockSentryCapture).toHaveBeenCalledOnce();
      expect(mockCaptureException).toHaveBeenCalledOnce();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
