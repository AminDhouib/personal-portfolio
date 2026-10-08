// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BASE_WIDTH,
  CRANE_REACH,
  CYCLE_MS,
  baseSpeed,
  craneOffset,
  drop,
  maxBlocksFor,
  newRun,
  pauseRun,
  perfectDropTime,
  resumeRun,
  runSeconds,
  swingFor,
  type TowerRun,
} from "../engine";

/** The first instant at or after `from` when the crane sits `target` units off the top slab. */
function timeAtOffset(run: TowerRun, from: number, target: number): number {
  const swing = run.swing;
  if (!swing) throw new Error("run is over");
  for (let t = Math.max(from, swing.spawnAt); t < from + 20_000; t++) {
    if (Math.round(craneOffset(swing, t)) === target) return t;
  }
  throw new Error(`no instant at offset ${target}`);
}

function must<T>(value: T | null): T {
  if (value === null) throw new Error("unexpected null");
  return value;
}

describe("swingFor (golden vectors)", () => {
  it("seed 7, block 1", () => {
    const s = swingFor(7, 1, 0, 0);
    expect(s.dir).toBe(1);
    expect(s.tone).toBe(5);
    expect(s.speed).toBeCloseTo(0.293218, 5);
    expect(s.phase).toBeCloseTo(0.005992, 5);
  });

  it("is stateless: the same inputs give the same swing", () => {
    expect(swingFor(7, 3, 2, 100)).toEqual(swingFor(7, 3, 2, 100));
    expect(swingFor(7, 3, 2, 100)).not.toEqual(swingFor(8, 3, 2, 100));
  });
});

describe("baseSpeed", () => {
  it("rises every 5 floors and caps at 0.6 units per ms", () => {
    expect(baseSpeed(0)).toBeCloseTo(0.3, 10);
    expect(baseSpeed(4)).toBeCloseTo(0.3, 10);
    expect(baseSpeed(5)).toBeCloseTo(0.325, 10);
    expect(baseSpeed(60)).toBeCloseTo(0.6, 10);
    expect(baseSpeed(500)).toBeCloseTo(0.6, 10);
  });
});

describe("craneOffset", () => {
  it("is a triangle sweep within +/- CRANE_REACH (golden samples, seed 7 block 1)", () => {
    const s = swingFor(7, 1, 0, 0);
    expect(craneOffset(s, 0)).toBeCloseTo(-204.9668, 3);
    expect(craneOffset(s, 500)).toBeCloseTo(-58.3579, 3);
    expect(craneOffset(s, 1000)).toBeCloseTo(88.2509, 3);
    for (let t = 0; t < 10_000; t += 37) {
      expect(Math.abs(craneOffset(s, t))).toBeLessThanOrEqual(CRANE_REACH);
    }
  });
});

describe("a scripted seed-7 run", () => {
  it("five perfects, two trims and a miss", () => {
    let run = newRun(7, 0);
    expect(run.slabs).toEqual([{ left: -BASE_WIDTH / 2, width: BASE_WIDTH }]);

    let now = 0;
    const perfectTimes: number[] = [];
    for (let i = 1; i <= 5; i++) {
      now = perfectDropTime(run, now);
      perfectTimes.push(now);
      const result = must(drop(run, now));
      expect(result.outcome).toMatchObject({ kind: "perfect", streak: i, grew: false });
      run = result.run;
    }
    expect(perfectTimes).toEqual([698, 1515, 2363, 3045, 3906]);
    expect(run.score).toBe(200);

    now = timeAtOffset(run, now, 30);
    let result = must(drop(run, now));
    expect(result.outcome).toEqual({
      kind: "trim",
      slab: { left: -90, width: 210 },
      cut: { left: 120, width: 30 },
      points: 10,
    });
    run = result.run;
    expect(run.streak).toBe(0);

    now = timeAtOffset(run, now, -9);
    result = must(drop(run, now));
    expect(result.outcome).toMatchObject({
      kind: "trim",
      slab: { left: -90, width: 201 },
      cut: { left: -99, width: 9 },
    });
    run = result.run;

    now = timeAtOffset(run, now, 205);
    result = must(drop(run, now));
    expect(result.outcome).toEqual({ kind: "miss", piece: { left: 115, width: 201 } });
    run = result.run;
    expect(run.over).toBe(true);
    expect(run.swing).toBeNull();
    expect({
      score: run.score,
      floors: run.slabs.length - 1,
      perfects: run.perfects,
      bestStreak: run.bestStreak,
    }).toEqual({
      score: 220,
      floors: 7,
      perfects: 5,
      bestStreak: 5,
    });
    expect(drop(run, now + 10_000)).toBeNull();
  });

  it("regrows a narrowed block by 12 on the third perfect in a row", () => {
    let run = newRun(7, 0);
    let now = timeAtOffset(run, 0, 20);
    run = must(drop(run, now)).run; // trimmed to 220
    const outcomes = [];
    for (let i = 0; i < 3; i++) {
      now = perfectDropTime(run, now);
      const result = must(drop(run, now));
      outcomes.push(result.outcome);
      run = result.run;
    }
    expect(outcomes[2]).toEqual({
      kind: "perfect",
      slab: { left: -106, width: 232 },
      streak: 3,
      grew: true,
      points: 40,
    });
  });

  it("never grows past the base width", () => {
    let run = newRun(7, 0);
    let now = 0;
    for (let i = 0; i < 3; i++) {
      now = perfectDropTime(run, now);
      run = must(drop(run, now)).run;
    }
    expect(run.slabs[run.slabs.length - 1]?.width).toBe(BASE_WIDTH);
  });
});

describe("pacing and pause", () => {
  it("refuses a drop before the next block has spawned", () => {
    let run = newRun(7, 0);
    run = must(drop(run, 698)).run;
    expect(run.swing?.spawnAt).toBe(698 + CYCLE_MS);
    expect(drop(run, 698 + CYCLE_MS - 1)).toBeNull();
    expect(drop(run, 698 + CYCLE_MS)).not.toBeNull();
  });

  it("a pause freezes the crane and is left out of the run time", () => {
    const run = newRun(7, 0);
    const paused = pauseRun(run, 500);
    const resumed = resumeRun(paused, 1500); // paused for 1000 ms
    const before = craneOffset(must(run.swing), 500);
    expect(craneOffset(must(resumed.swing), 1500)).toBeCloseTo(before, 10);
    expect(runSeconds(resumed, 4500)).toBe(3);
  });

  it("is deterministic: replaying the same drop instants gives the same run", () => {
    const play = () => {
      let run = newRun(42, 0);
      for (const t of [900, 2100, 3300, 4400, 5600]) {
        const result = drop(run, t);
        if (result) run = result.run;
      }
      return run;
    };
    expect(play()).toEqual(play());
  });
});

describe("maxBlocksFor", () => {
  it("allows one block per 400 ms cycle of active time, plus slack", () => {
    expect(maxBlocksFor(0)).toBe(4); // floor(1000 / 400) + 2
    expect(maxBlocksFor(10)).toBe(29); // floor(11000 / 400) + 2
    expect(maxBlocksFor(60)).toBe(154);
  });
});

describe("a block that is fully off a very narrow slab", () => {
  it("misses instead of scoring a perfect", () => {
    const base = newRun(7, 0);
    const run = { ...base, slabs: [{ left: -3, width: 6 }] };
    const swing = must(run.swing);
    let t = swing.spawnAt;
    while (Math.round(craneOffset(swing, t)) !== 6) t++;
    const result = must(drop(run, t));
    expect(result.outcome.kind).toBe("miss");
    expect(result.run.over).toBe(true);
  });
});
