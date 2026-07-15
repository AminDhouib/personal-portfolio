import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The env presence gate (validateRequiredEnv) is tested directly in env.test.ts.
// This file pins the WIRING that was the actual dead-gate bug: that
// register() invokes the gate on a real nodejs server boot, and ONLY then --
// never during `next build`, never on the edge runtime.
const { validateSpy } = vi.hoisted(() => ({ validateSpy: vi.fn() }));

vi.mock("@/env", () => ({ validateRequiredEnv: validateSpy }));
vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
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
