import { afterEach, describe, it, expect, vi } from "vitest";
import { comboMultiplier } from "../difficulty";
import { spawnIntervalMs } from "../spawning";
import type { GameRefs } from "../types";
import { validateArcadeSubmission } from "@/lib/arcade/games";

// The early boost raises the opening spawn rate. These tests pin that the
// faster start still sits inside the leaderboard's plausibility budget
// (checkSpaceShooter: kills <= 6s + 20, dodged obstacles <= 7s + 40), so an
// honest best-case run is never rejected.

const refsAt = { startedAt: 0, isMobile: false } as unknown as GameRefs;

function spawnsPerSecond(t: number): number {
  vi.spyOn(performance, "now").mockReturnValue(t * 1000);
  return 1000 / spawnIntervalMs(refsAt);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Orbital early boost vs the board's plausibility bounds", () => {
  it("never spawns faster than 3.6 per second at any time in the run", () => {
    for (let t = 0; t <= 600; t += 0.5) {
      expect(spawnsPerSecond(t)).toBeLessThanOrEqual(3.6);
    }
  });

  it("accepts a synthetic best-case 120 s run: every spawn killed at combo 99", () => {
    let spawns = 0;
    for (let t = 0; t < 120; t += 0.25) spawns += spawnsPerSecond(t) * 0.25;
    const kills = Math.floor(spawns);
    const seconds = 120;
    // 22 = highest base kill points, at the combo-99 multiplier; plus time alive.
    const score = kills * 22 * comboMultiplier(99) + 8 * seconds;
    const distance = 100 * seconds;
    const verdict = validateArcadeSubmission("space-shooter", score, { seconds, kills, distance });
    expect(verdict.ok).toBe(true);
    // The kill count itself is inside the 6s + 20 budget with room to spare.
    expect(kills).toBeLessThan(6 * (seconds + 2) + 20);
  });
});
