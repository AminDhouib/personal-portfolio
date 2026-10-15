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

describe("instrumentation-client replay wiring", () => {
  beforeEach(() => {
    sentryInit.mockClear();
    addIntegration.mockClear();
    replayIntegration.mockClear();
    posthogInit.mockClear();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  });

  afterEach(() => {
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

  it("does not put the replay integration in init (it loads after the page has loaded)", async () => {
    await loadClientInit();
    const options = sentryInit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options.integrations).toBeUndefined();
  });

  it("adds the replay integration with inputs masked and the ph classes honored", async () => {
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => cb());
    await loadClientInit();
    // jsdom reports readyState "complete", so the idle step has run by now.
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
});
