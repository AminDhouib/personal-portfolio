// @vitest-environment node
import { describe, expect, it } from "vitest";

import { decodeLog, encodeLog } from "../codec";
import type { FloorSpace } from "../core/floor";
import type { TurnRecord } from "../run";
import { configForRef } from "../run";
import { replayOk } from "./helpers";
import { isTowerId } from "../towers";
import fixtures from "./fixtures/upstream-runs.json";

// upstream-runs.json was generated from WarriorJS bc68e87 (MIT, see ../LICENSE) by
// towers/the-powder-keep/fixtures.mjs in a checkout of upstream, using its built dist:
// - 36 "bot" runs: a generic bot played every floor of both towers, normal and epic;
// - "fuzz" runs: seeded random action sequences (bind, detonate and idle included) on the same
//   floors, 6 per floor.
// The warrior's actions are recorded in the action-log alphabet along with upstream's result,
// score breakdown, a per-turn digest (event types and warrior status) and the final floor map
// (in full for bot runs, as a hash for fuzz runs). Replaying only those actions through the port
// must give identical outcomes, turn by turn.

interface Fixture {
  tower: string;
  level: number;
  epic: boolean;
  kind: "bot" | "fuzz";
  log: string;
  passed: boolean;
  turns: number;
  score: { warrior: number; timeBonus: number; clearBonus: number; total: number } | null;
  digest: string[];
  mapHash: number;
  finalMap?: FloorSpace[][];
}

const RUNS = fixtures as Fixture[];
const BOTS = RUNS.filter((run) => run.kind === "bot");
const FUZZ = RUNS.filter((run) => run.kind === "fuzz");

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

/** Canonical JSON (sorted keys, no unit ids): the same string the fixture generator hashes. */
function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined && key !== "id")
      .map((key) => `${JSON.stringify(key)}:${canon(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** One string per turn, as the generator writes it: event actors and types, warrior status. */
function digestOf(records: TurnRecord[]): string[] {
  return records.map((record) => {
    const events = record.events
      .map((event) => `${event.actor ? event.actor.name : "-"}:${event.action.type}`)
      .join(",");
    const status = record.events.at(-1)?.warriorStatus;
    return `${events}|${status?.health}/${status?.score}`;
  });
}

function label(run: Fixture, index: number): string {
  return `${run.kind} ${run.tower} ${run.level}${run.epic ? " epic" : ""} #${index}`;
}

function replayFixture(run: Fixture) {
  if (!isTowerId(run.tower)) throw new Error(`unknown tower ${run.tower}`);
  const actions = decodeLog(run.log);
  expect(actions).not.toBeNull();
  const config = configForRef(
    { kind: "tower", tower: run.tower, level: run.level, epic: run.epic },
    "Probe",
  );
  return { actions: actions ?? [], replay: replayOk(config, actions ?? []) };
}

describe("upstream parity", () => {
  it("holds 36 bot runs and a set of fuzz runs under the size budget", () => {
    expect(BOTS).toHaveLength(36);
    expect(FUZZ.length).toBeGreaterThanOrEqual(200);
    expect(RUNS.filter((run) => run.passed)).toHaveLength(RUNS.filter((run) => run.score).length);
  });

  it("covers bind, detonate, idle turns, ticking and death", () => {
    const types = new Set(
      RUNS.flatMap((run) => run.digest.flatMap((turn) => turn.split("|")[0]?.split(",") ?? [])).map(
        (event) => event.split(":")[1],
      ),
    );
    for (const type of ["bind", "detonate", "idle", "explode", "tick", "rescue", "shoot", "die"]) {
      expect(types.has(type), type).toBe(true);
    }
    expect(RUNS.filter((run) => run.log.slice(2).match(/(?:..)*?\.-/))).not.toHaveLength(0);
  });

  it.each(RUNS.map((run, index) => [label(run, index), run] as const))(
    "%s replays to upstream's result",
    (_label, run) => {
      const { actions, replay } = replayFixture(run);

      // The log survives a round trip through the codec, idle turns included.
      expect(encodeLog(actions)).toBe(run.log);

      expect(replay.consumed).toBe(actions.length);
      expect(replay.result.passed).toBe(run.passed);
      expect(replay.result.turns).toBe(run.turns);
      expect(replay.result.score).toEqual(run.score);

      // Turn by turn: the events that happened and the warrior's status after each turn.
      expect(digestOf(replay.records)).toEqual(run.digest);

      const lastMap = replay.records.at(-1)?.events.at(-1)?.floorMap ?? [];
      expect(fnv1a(canon(lastMap))).toBe(run.mapHash);
      if (run.kind === "bot") {
        expect(withoutIds(lastMap)).toEqual(run.finalMap);
      }
    },
  );
});
