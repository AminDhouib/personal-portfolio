// @vitest-environment node
import { describe, expect, it } from "vitest";

import { decodeLog } from "../codec";
import type { FloorSpace } from "../core/floor";
import { configForRef, replayLog } from "../run";
import { isTowerId } from "../towers";
import fixtures from "./fixtures/upstream-runs.json";

// upstream-runs.json was generated from WarriorJS bc68e87 (MIT, see ../LICENSE): a generic bot
// played every floor of both towers, normal and epic, 36 runs, and the warrior's actions were
// recorded in the action-log alphabet along with upstream's result, score breakdown and final
// floor map. Replaying only those actions through the port must give identical outcomes.

interface Fixture {
  tower: string;
  level: number;
  epic: boolean;
  log: string;
  passed: boolean;
  turns: number;
  score: { warrior: number; timeBonus: number; clearBonus: number; total: number } | null;
  finalMap: FloorSpace[][];
}

const RUNS = fixtures as Fixture[];

/** Unit ids are an addition of the port: upstream maps do not have them. */
function withoutIds(map: FloorSpace[][]): unknown {
  return map.map((row) =>
    row.map((space) => {
      if (!space.unit) return space;
      const { name, maxHealth, warrior } = space.unit;
      return { ...space, unit: { name, maxHealth, ...(warrior ? { warrior } : {}) } };
    }),
  );
}

describe("upstream parity (36 recorded runs)", () => {
  it("holds all 36 runs", () => {
    expect(RUNS).toHaveLength(36);
    expect(RUNS.filter((run) => run.passed)).toHaveLength(RUNS.filter((run) => run.score).length);
  });

  it.each(RUNS.map((run) => [`${run.tower} ${run.level}${run.epic ? " epic" : ""}`, run] as const))(
    "%s replays to upstream's result",
    (_label, run) => {
      if (!isTowerId(run.tower)) throw new Error(`unknown tower ${run.tower}`);
      const actions = decodeLog(run.log);
      expect(actions).not.toBeNull();
      const config = configForRef(
        { kind: "tower", tower: run.tower, level: run.level, epic: run.epic },
        "Probe",
      );
      const replay = replayLog(config, actions ?? []);

      expect(replay.consumed).toBe(actions?.length);
      expect(replay.result.passed).toBe(run.passed);
      expect(replay.result.turns).toBe(run.turns);
      expect(replay.result.score).toEqual(run.score);

      const lastEvent = replay.records.at(-1)?.events.at(-1);
      expect(withoutIds(lastEvent?.floorMap ?? [])).toEqual(run.finalMap);
    },
  );
});
