// @vitest-environment node
import { describe, expect, it } from "vitest";

import { Detonate, Rest } from "../abilities";
import type { LevelConfig } from "../core/level-config";
import { Ticking } from "../effects";
import { createRun } from "../run";
import { EAST } from "../spatial";
import { Captive } from "../units";

/** Real Detonate, Captive and Ticking: the warrior stands next to a captive that is already ticking. */
function bombedCaptiveConfig(): LevelConfig {
  return {
    number: 1,
    description: "",
    tip: "",
    clue: "",
    timeBonus: 10,
    aceScore: 10,
    floor: {
      size: { width: 4, height: 1 },
      stairs: { x: 3, y: 0 },
      warrior: {
        name: "Probe",
        maxHealth: 20,
        abilities: {
          detonate: Detonate.with({ targetPower: 8, surroundingPower: 4 }),
          rest: Rest.with({ healthGain: 0.1 }),
        },
        position: { x: 0, y: 0, facing: EAST },
      },
      units: [
        {
          unit: Captive,
          effects: { ticking: Ticking.with({ time: 10 }) },
          position: { x: 1, y: 0, facing: EAST },
        },
      ],
    },
  };
}

describe("detonating a ticking captive", () => {
  it("chains the explosion instead of throwing, and ends the run cleanly", () => {
    const run = createRun(bombedCaptiveConfig());
    const record = run.step({ name: "detonate", direction: "forward" });

    const types = record.events.map((event) => event.action.type);
    expect(types).toContain("chainDetonate");
    expect(types).toContain("explode");
    expect(run.turnCount).toBe(1);
    expect(run.status).toBe("failed");
    expect(run.result().warrior.health).toBe(0);
  });

  it("kills the captive once, not twice", () => {
    const run = createRun(bombedCaptiveConfig());
    const record = run.step({ name: "detonate", direction: "forward" });
    const captiveDeaths = record.events.filter(
      (event) => event.actor?.name === "Captive" && event.action.type === "die",
    );
    expect(captiveDeaths).toHaveLength(1);
  });
});
