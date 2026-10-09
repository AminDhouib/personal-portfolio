// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { TICK } from "../config";
import { replay, ReplayError, replayAsync } from "../replay";
import { resetSim, S } from "../state";
import { BOARD_A, BOARD_S, MID_RUN_S, play } from "./scripted";

afterEach(() => resetSim({ seed: "after-replay" }));

const SEED = "replay-day";
const SCRIPT = [...BOARD_S, ...MID_RUN_S];
const TICKS = 2400;

function expectReplayError(fn: () => unknown, code: ReplayError["code"]): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(ReplayError);
  expect((caught as ReplayError).code).toBe(code);
}

describe("the action cap", () => {
  const retires = (n: number): number[][] => Array.from({ length: n }, () => [0, 8]);

  it("plays 700 actions and refuses 701 before anything runs", () => {
    expect(() =>
      replay({ seed: SEED, mode: "survival", log: retires(700), ticks: 10 }),
    ).not.toThrow();
    expectReplayError(
      () => replay({ seed: SEED, mode: "survival", log: retires(701), ticks: 10 }),
      "too-many",
    );
  });
});

describe("replay", () => {
  it("reproduces a recorded run exactly: same hash, score and end", () => {
    const run = play(SEED, "survival", SCRIPT, TICKS);
    expect(run.log.length).toBeGreaterThan(15);

    const result = replay({ seed: SEED, mode: "survival", log: run.log, ticks: run.ticks });
    expect(result.hash).toBe(run.hash);
    expect(result.score).toBe(run.score);
    expect(result.endedAtTick).toBe(TICKS);
    expect(result.endReason).toBe("time");
    expect(result.seconds).toBe(TICKS * TICK);
    expect(result.score).toBeGreaterThan(TICKS * TICK * 10 - 1);
  });

  it("rebuilds the same action log as it plays it (refusals included)", () => {
    const run = play(SEED, "survival", SCRIPT, TICKS);
    replay({ seed: SEED, mode: "survival", log: run.log, ticks: run.ticks });
    expect(S.log).toEqual(run.log);
  });

  it("is repeatable, and a stranger run in between does not disturb it", () => {
    const run = play(SEED, "survival", SCRIPT, TICKS);
    const opts = { seed: SEED, mode: "survival" as const, log: run.log, ticks: run.ticks };
    const first = replay(opts);
    replay({ seed: "somebody-else", mode: "survival", log: [], ticks: 600 });
    expect(replay(opts)).toEqual(first);
  });

  it("a different seed is a different run", () => {
    const run = play(SEED, "survival", SCRIPT, TICKS);
    const other = replay({ seed: "other-day", mode: "survival", log: run.log, ticks: run.ticks });
    expect(other.hash).not.toBe(run.hash);
  });

  it("tampering with one action's tick changes the run", () => {
    const run = play(SEED, "survival", SCRIPT, TICKS);
    // The repair crew switched on at tick 900 bills continuously; delaying it moves the money.
    const index = run.log.findIndex((e) => e[1] === 7);
    expect(index).toBeGreaterThan(0);
    const tampered = run.log.map((e, i) => (i === index ? [900, ...e.slice(1)] : e));
    const result = replay({ seed: SEED, mode: "survival", log: tampered, ticks: run.ticks });
    expect(result.hash).not.toBe(run.hash);
  });

  it("tampering with an action's argument changes the run", () => {
    const run = play(SEED, "survival", SCRIPT, TICKS);
    const index = run.log.findIndex((e) => e[1] === 7);
    const tampered = run.log.map((e, i) => (i === index ? [e[0], 7, 0] : e));
    const result = replay({ seed: SEED, mode: "survival", log: tampered, ticks: run.ticks });
    expect(result.hash).not.toBe(run.hash);
  });

  it("applies an action issued on the very last tick, after the last step", () => {
    const result = replay({ seed: SEED, mode: "survival", log: [[100, 0, 0, 0, 0]], ticks: 100 });
    expect(result.endedAtTick).toBe(100);
    expect(S.services.map((s) => s.type)).toEqual(["waf"]);
  });

  it("stops at a retire and says so", () => {
    const run = play(SEED, "survival", [...BOARD_A, [300, { op: 8 }]], 600);
    expect(run.log.at(-1)).toEqual([300, 8]);
    const result = replay({ seed: SEED, mode: "survival", log: run.log, ticks: 600 });
    expect(result.endReason).toBe("retired");
    expect(result.endedAtTick).toBe(300);
    expect(result.seconds).toBe(15);
    expect(result.hash).toBe(run.hash);
  });

  it("stops where the run was lost, with nothing built to serve the traffic", () => {
    const result = replay({ seed: SEED, mode: "survival", log: [], ticks: 18000 });
    expect(["reputation", "money"]).toContain(result.endReason);
    expect(result.endedAtTick).toBeLessThan(18000);
    expect(result.seconds).toBe(result.endedAtTick * TICK);
  });

  it("plays sandbox runs, which never end on their own", () => {
    const result = replay({ seed: SEED, mode: "sandbox", log: [], ticks: 2000 });
    expect(result.endReason).toBe("time");
    expect(result.endedAtTick).toBe(2000);
  });
});

describe("a log the server must reject", () => {
  const ok = [0, 0, 0, 0, 0];

  it("with ticks that go backwards", () => {
    expectReplayError(
      () =>
        replay({
          seed: SEED,
          mode: "survival",
          log: [
            [50, 7, 1],
            [49, 7, 0],
          ],
          ticks: 100,
        }),
      "tick-order",
    );
  });

  it("with an action after the run's last tick", () => {
    expectReplayError(
      () => replay({ seed: SEED, mode: "survival", log: [[101, 7, 1]], ticks: 100 }),
      "tick-range",
    );
  });

  it("with a negative or fractional tick", () => {
    expectReplayError(
      () => replay({ seed: SEED, mode: "survival", log: [[-1, 7, 1]], ticks: 100 }),
      "tick-range",
    );
    expectReplayError(
      () => replay({ seed: SEED, mode: "survival", log: [[1.5, 7, 1]], ticks: 100 }),
      "tick-range",
    );
  });

  it("with an op nobody defined", () => {
    expectReplayError(
      () => replay({ seed: SEED, mode: "survival", log: [[0, 9]], ticks: 100 }),
      "unknown-op",
    );
    expectReplayError(
      () => replay({ seed: SEED, mode: "survival", log: [[0, 1.5]], ticks: 100 }),
      "unknown-op",
    );
  });

  it("with arguments of the wrong count, kind or range", () => {
    const bad: number[][] = [
      [0, 0, 0, 0],
      [0, 0, 99, 0, 0],
      [0, 0, -1, 0, 0],
      [0, 0, 0, 0.5, 0],
      [0, 1, 0],
      [0, 1, -1, 2],
      [0, 3, 1.5],
      [0, 7, 2],
      [0, 8, 1],
      [0, 3, Number.NaN],
    ];
    for (const entry of bad) {
      expectReplayError(
        () => replay({ seed: SEED, mode: "survival", log: [entry], ticks: 100 }),
        "bad-args",
      );
    }
  });

  it("with an entry that is not an array of numbers", () => {
    const strings = ["x"] as unknown as number[];
    expectReplayError(
      () => replay({ seed: SEED, mode: "survival", log: [strings], ticks: 100 }),
      "bad-args",
    );
  });

  it("with a bad tick count", () => {
    expectReplayError(
      () => replay({ seed: SEED, mode: "survival", log: [ok], ticks: -1 }),
      "tick-range",
    );
    expectReplayError(
      () => replay({ seed: SEED, mode: "survival", log: [], ticks: 1.5 }),
      "tick-range",
    );
  });

  it("is rejected before any of it plays", () => {
    resetSim({ seed: "untouched" });
    expectReplayError(
      () => replay({ seed: SEED, mode: "survival", log: [ok, [0, 9]], ticks: 100 }),
      "unknown-op",
    );
    expect(S.seed).toBe("untouched");
  });
});

describe("replayAsync", () => {
  it("gives the same answer as replay, yielding between chunks", () => {
    const run = play(SEED, "survival", SCRIPT, TICKS);
    const opts = { seed: SEED, mode: "survival" as const, log: run.log, ticks: run.ticks };
    const sync = replay(opts);

    let yields = 0;
    return replayAsync(opts, {
      yieldEvery: 500,
      yieldFn: () => {
        yields++;
        return Promise.resolve();
      },
    }).then((result) => {
      expect(result).toEqual(sync);
      // 2400 ticks in chunks of 500: it yielded between them.
      expect(yields).toBe(4);
    });
  });

  it("stops yielding once the run is over", async () => {
    let yields = 0;
    const result = await replayAsync(
      { seed: SEED, mode: "survival", log: [[100, 8]], ticks: 5000 },
      {
        yieldEvery: 50,
        yieldFn: () => {
          yields++;
          return Promise.resolve();
        },
      },
    );
    expect(result.endReason).toBe("retired");
    expect(yields).toBeLessThanOrEqual(3);
  });

  it("rejects a bad log with the same typed error", async () => {
    await expect(
      replayAsync(
        { seed: SEED, mode: "survival", log: [[5, 9]], ticks: 100 },
        { yieldEvery: 50, yieldFn: () => Promise.resolve() },
      ),
    ).rejects.toBeInstanceOf(ReplayError);
  });

  it("refuses a chunk size that would never finish", async () => {
    await expect(
      replayAsync(
        { seed: SEED, mode: "survival", log: [], ticks: 100 },
        { yieldEvery: 0, yieldFn: () => Promise.resolve() },
      ),
    ).rejects.toThrow();
  });

  it("starts from the budget it is given, else the mode default", () => {
    const def = replay({ seed: SEED, mode: "survival", log: [], ticks: 0 });
    expect(def.endedAtTick).toBe(0);
    expect(S.money).toBe(500);
    replay({ seed: SEED, mode: "survival", budget: 12345, log: [], ticks: 0 });
    expect(S.money).toBe(12345);
  });
});
