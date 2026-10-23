import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SENTRY_DATA_COLLECTION, SENTRY_TRACE_LIFECYCLE } from "@/lib/sentry-options";

// The env presence gate (validateRequiredEnv) is tested directly in env.test.ts.
// This file pins the WIRING that was the actual dead-gate bug: that
// register() invokes the gate on a real nodejs server boot, and ONLY then --
// never during `next build`, never on the edge runtime.
const { validateSpy, sentryInit } = vi.hoisted(() => ({
  validateSpy: vi.fn(),
  sentryInit: vi.fn(),
}));

vi.mock("@/env", () => ({ validateRequiredEnv: validateSpy }));
vi.mock("@sentry/nextjs", () => ({
  init: sentryInit,
  captureRequestError: vi.fn(),
}));

const ORIGINAL_RUNTIME = process.env.NEXT_RUNTIME;
const ORIGINAL_PHASE = process.env.NEXT_PHASE;

async function callRegister() {
  vi.resetModules();
  const mod = await import("@/instrumentation");
  mod.register();
}

describe("instrumentation register() env-gate wiring", () => {
  beforeEach(() => {
    validateSpy.mockReset();
    sentryInit.mockClear();
  });

  afterEach(() => {
    if (ORIGINAL_RUNTIME === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = ORIGINAL_RUNTIME;
    if (ORIGINAL_PHASE === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = ORIGINAL_PHASE;
  });

  it("runs the presence gate on a nodejs server boot", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.NEXT_PHASE;
    await callRegister();
    expect(validateSpy).toHaveBeenCalledTimes(1);
  });

  it("skips the gate during `next build` (phase-production-build)", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NEXT_PHASE = "phase-production-build";
    await callRegister();
    expect(validateSpy).not.toHaveBeenCalled();
  });

  it("does not run the nodejs gate on the edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    delete process.env.NEXT_PHASE;
    await callRegister();
    expect(validateSpy).not.toHaveBeenCalled();
  });

  it("propagates a thrown gate error so a missing var fails the boot", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.NEXT_PHASE;
    validateSpy.mockImplementationOnce(() => {
      throw new Error("Missing required environment variable(s): OPENROUTER_KEY");
    });
    vi.resetModules();
    const mod = await import("@/instrumentation");
    expect(() => mod.register()).toThrow(/Missing required environment variable/);
  });
});

describe("instrumentation register() Sentry options", () => {
  beforeEach(() => {
    validateSpy.mockReset();
    sentryInit.mockClear();
  });

  afterEach(() => {
    if (ORIGINAL_RUNTIME === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = ORIGINAL_RUNTIME;
    if (ORIGINAL_PHASE === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = ORIGINAL_PHASE;
  });

  it.each(["nodejs", "edge"])(
    "inits the %s runtime with the v10 data collection and trace lifecycle",
    async (runtime) => {
      process.env.NEXT_RUNTIME = runtime;
      process.env.NEXT_PHASE = "phase-production-build";
      await callRegister();
      expect(sentryInit).toHaveBeenCalledTimes(1);
      expect(sentryInit.mock.calls[0]?.[0]).toMatchObject({
        tracesSampleRate: 0.1,
        traceLifecycle: SENTRY_TRACE_LIFECYCLE,
        dataCollection: SENTRY_DATA_COLLECTION,
      });
    },
  );
});
