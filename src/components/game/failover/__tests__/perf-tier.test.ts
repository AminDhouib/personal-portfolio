// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  GOVERNOR_FRAMES,
  TIER_SETTINGS,
  createGovernor,
  initialTier,
  recordFrame,
  type PerfEnv,
} from "../scene/perf-tier";

const DESKTOP: PerfEnv = { coarsePointer: false, deviceMemory: 16, hardwareConcurrency: 12 };
const BUDGET_PHONE: PerfEnv = { coarsePointer: true, deviceMemory: 2, hardwareConcurrency: 8 };

function feed(governor: ReturnType<typeof createGovernor>, frames: number, ms: number) {
  let g = governor;
  for (let i = 0; i < frames; i++) g = recordFrame(g, ms);
  return g;
}

describe("initialTier", () => {
  it("is low on a coarse pointer with 4 GB or less, or 4 cores or fewer", () => {
    expect(initialTier(BUDGET_PHONE, "auto")).toBe("low");
    expect(
      initialTier({ coarsePointer: true, deviceMemory: 8, hardwareConcurrency: 4 }, "auto"),
    ).toBe("low");
    expect(initialTier({ coarsePointer: true, deviceMemory: 4 }, "auto")).toBe("low");
  });

  it("is high on a desktop, and on a well-equipped phone", () => {
    expect(initialTier(DESKTOP, "auto")).toBe("high");
    expect(
      initialTier({ coarsePointer: true, deviceMemory: 8, hardwareConcurrency: 8 }, "auto"),
    ).toBe("high");
    // A desktop with little memory still has a fine pointer: high.
    expect(
      initialTier({ coarsePointer: false, deviceMemory: 2, hardwareConcurrency: 2 }, "auto"),
    ).toBe("high");
  });

  it("treats a phone that reports nothing as high", () => {
    expect(initialTier({ coarsePointer: true }, "auto")).toBe("high");
  });

  it("lets the stored override win either way", () => {
    expect(initialTier(DESKTOP, "low")).toBe("low");
    expect(initialTier(BUDGET_PHONE, "high")).toBe("high");
  });
});

describe("the frame-time governor", () => {
  it("downgrades after 60 frames averaging 30 ms", () => {
    const g = feed(createGovernor("high", "auto"), GOVERNOR_FRAMES, 30);
    expect(GOVERNOR_FRAMES).toBe(60);
    expect(g.tier).toBe("low");
  });

  it("does not judge before the window is full", () => {
    expect(feed(createGovernor("high", "auto"), GOVERNOR_FRAMES - 1, 30).tier).toBe("high");
  });

  it("keeps high when frames average 24 ms or less", () => {
    expect(feed(createGovernor("high", "auto"), GOVERNOR_FRAMES * 3, 24).tier).toBe("high");
    expect(feed(createGovernor("high", "auto"), GOVERNOR_FRAMES * 3, 16.7).tier).toBe("high");
  });

  it("judges by the average, so one long frame does not downgrade", () => {
    let g = createGovernor("high", "auto");
    g = recordFrame(g, 400);
    g = feed(g, GOVERNOR_FRAMES - 1, 16);
    expect(g.tier).toBe("high");
  });

  it("never upgrades within a session", () => {
    let g = feed(createGovernor("high", "auto"), GOVERNOR_FRAMES, 30);
    g = feed(g, GOVERNOR_FRAMES * 5, 5);
    expect(g.tier).toBe("low");
    expect(feed(createGovernor("low", "auto"), GOVERNOR_FRAMES * 5, 5).tier).toBe("low");
  });

  it("never overrides a stored choice of high", () => {
    expect(feed(createGovernor("high", "high"), GOVERNOR_FRAMES * 2, 60).tier).toBe("high");
  });
});

describe("TIER_SETTINGS", () => {
  it("caps low at device pixel ratio 1, no antialias, 150 drawn requests and 30 fps", () => {
    expect(TIER_SETTINGS.low).toEqual({
      maxPixelRatio: 1,
      antialias: false,
      maxDrawnRequests: 150,
      frameIntervalMs: 1000 / 30,
      idleAnimation: false,
    });
  });

  it("gives high more of everything", () => {
    expect(TIER_SETTINGS.high.maxPixelRatio).toBeGreaterThan(1);
    expect(TIER_SETTINGS.high.antialias).toBe(true);
    expect(TIER_SETTINGS.high.maxDrawnRequests).toBeGreaterThan(150);
    expect(TIER_SETTINGS.high.frameIntervalMs).toBe(0);
    expect(TIER_SETTINGS.high.idleAnimation).toBe(true);
  });
});
