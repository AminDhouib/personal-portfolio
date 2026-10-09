// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const bot = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../engine/reference-bot", async (importOriginal) => {
  const real = await importOriginal<typeof import("../engine/reference-bot")>();
  return {
    ...real,
    // The generation attempts all fail; only the fallback floor's own par run reaches the real bot.
    playWithBot: (config: Parameters<typeof real.playWithBot>[0]) => {
      bot.calls += 1;
      return bot.calls <= 64
        ? {
            actions: [],
            status: "failed" as const,
            result: { passed: false, turns: 0, score: null },
          }
        : real.playWithBot(config);
    },
  };
});

import { dailyFloor, dayNumber } from "../daily";

describe("dailyFloor when no generated floor is solvable", () => {
  it("tries exactly 64 attempts, then falls back to the epic built-in floor", () => {
    const day = "2026-10-15";
    const floor = dailyFloor(day);
    expect(floor.source).toBe("fallback");
    expect(floor.attempt).toBe(64);
    expect(bot.calls).toBe(65);
    expect(floor.config.number).toBe((dayNumber(day) % 9) + 1);
    expect(floor.par).toBeGreaterThan(0);
  });
});
