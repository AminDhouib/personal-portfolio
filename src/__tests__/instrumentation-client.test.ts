import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Pins the browser-side monitoring wiring: Sentry's replay sampling and masking, the lazy add
// of the replay integration, and PostHog's recording masks. The tunnel's own behavior lives in
// src/app/monitoring/__tests__/route.test.ts.
const { sentryInit, addIntegration, replayIntegration, posthogInit } = vi.hoisted(() => ({
  sentryInit: vi.fn(),
  addIntegration: vi.fn(),
  replayIntegration: vi.fn((options: unknown) => ({ name: "Replay", options })),
  posthogInit: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  init: sentryInit,
  addIntegration,
  replayIntegration,
  captureRouterTransitionStart: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: { init: posthogInit } }));

async function loadClientInit() {
  vi.resetModules();
  await import("@/instrumentation-client");
}

// Flushes the dynamic import().then() chain the replay integration is added through.
async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// Each test re-imports the module, which registers fresh window listeners; remove them so one
// test's interaction cannot start another test's recorder.
const registered: Array<[string, EventListenerOrEventListenerObject]> = [];
const realAddEventListener = window.addEventListener.bind(window);

describe("instrumentation-client replay wiring", () => {
  beforeEach(() => {
    vi.spyOn(window, "addEventListener").mockImplementation((type, listener, options) => {
      registered.push([type, listener as EventListenerOrEventListenerObject]);
      realAddEventListener(type, listener, options);
    });
    sentryInit.mockClear();
    addIntegration.mockClear();
    replayIntegration.mockClear();
    posthogInit.mockClear();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    // jsdom serves localhost, which the SDK treats as a no-report host; tests default to the
    // real site and the loopback cases below override it.
    vi.stubGlobal("location", { hostname: "amindhou.com" });
  });

  afterEach(() => {
    for (const [type, listener] of registered.splice(0)) window.removeEventListener(type, listener);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("samples 10% of sessions and every errored session", async () => {
    await loadClientInit();
    const options = sentryInit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options.replaysSessionSampleRate).toBe(0.1);
    expect(options.replaysOnErrorSampleRate).toBe(1.0);
    expect(options.tunnel).toBe("/monitoring");
  });

  it("does not put the replay integration in init, and waits for a first interaction", async () => {
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => cb());
    await loadClientInit();
    const options = sentryInit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options.integrations).toBeUndefined();
    await flush();
    expect(replayIntegration).not.toHaveBeenCalled();
    expect(addIntegration).not.toHaveBeenCalled();
  });

  it("adds the replay integration once, masked, after the first interaction", async () => {
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => cb());
    await loadClientInit();
    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new Event("keydown"));
    await flush();
    expect(replayIntegration).toHaveBeenCalledTimes(1);
    expect(replayIntegration).toHaveBeenCalledWith({
      maskAllInputs: true,
      maskAllText: false,
      blockAllMedia: false,
      mask: [".ph-sensitive"],
      block: [".ph-no-capture"],
    });
    expect(addIntegration).toHaveBeenCalledTimes(1);
  });

  it("masks PostHog recordings and leaves the on-switch to project settings", async () => {
    await loadClientInit();
    const options = posthogInit.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(options.session_recording).toEqual({
      maskAllInputs: true,
      maskTextSelector: ".ph-sensitive",
    });
    expect(options).not.toHaveProperty("disable_session_recording");
  });

  it("is enabled on the real site", async () => {
    await loadClientInit();
    const options = sentryInit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options.enabled).toBe(true);
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "stays disabled and never starts the recorder on loopback host %s",
    async (hostname) => {
      vi.stubGlobal("location", { hostname });
      vi.stubGlobal("requestIdleCallback", (cb: () => void) => cb());
      await loadClientInit();
      const options = sentryInit.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(options.enabled).toBe(false);
      window.dispatchEvent(new Event("pointerdown"));
      await flush();
      expect(replayIntegration).not.toHaveBeenCalled();
      expect(addIntegration).not.toHaveBeenCalled();
    },
  );
});
