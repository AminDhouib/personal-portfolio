import { afterEach, describe, expect, it, vi } from "vitest";
import { dailyReplayOptions, dailyRun, dayNumber, DAILY_MAX_TICKS } from "../daily/daily";
import { dispatch } from "../sim/action-log";
import { stateHash } from "../sim/hash";
import { parseProof } from "../sim/proof";
import { replay } from "../sim/replay";
import { BOARD_S, MID_RUN_S } from "../sim/__tests__/scripted";
import { resetSim, S } from "../sim/state";
import { makeController } from "./ui-harness";

vi.mock("@/lib/log", () => ({ captureException: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));

import { createFailoverVerifier } from "@/lib/arcade/failover-verify";

// The Daily Incident in the live controller: it plays the day's own seed and incident, steps
// one tick at a time so the incident's calls land on their ticks, ends at the 900 s cap, and
// hands the board a proof the server's replay reproduces.

const DAY = "2026-10-15";
const BOARD = [...BOARD_S, ...MID_RUN_S];

afterEach(() => resetSim({ seed: "controller-daily-reset" }));

function started(day = DAY) {
  const h = makeController();
  h.controller.start();
  h.frame(16);
  h.controller.startDaily(day);
  return h;
}

describe("starting a daily", () => {
  it("plays the day's seed in survival, even from a sandbox controller", () => {
    const h = started();
    expect(S.gameMode).toBe("survival");
    expect(h.controller.getHud().mode).toBe("survival");
    expect(h.controller.getHud().daily).toEqual({ day: DAY, result: null });
    expect(S.log).toEqual([]);
  });

  it("makes the incident's opening mix", () => {
    const h = started();
    const fresh = structuredClone(S.trafficDistribution);
    const run = dailyRun(DAY);
    resetSim({ seed: run.seed, mode: "survival" });
    const plain = structuredClone(S.trafficDistribution);
    run.setup();
    expect(S.trafficDistribution).toEqual(fresh);
    expect(S.trafficDistribution).not.toEqual(plain);
    expect(h.controller.getHud().daily?.day).toBe(DAY);
  });

  it("is dropped by Play again, a free survival run (the daily left the controller in survival)", () => {
    const h = started();
    h.controller.restart();
    expect(h.controller.getHud().daily).toBeNull();
    expect(S.gameMode).toBe("survival");
  });
});

describe("swapping the run for one built elsewhere", () => {
  it("drops the daily, as a save load or an arch import does", async () => {
    const h = started();
    expect(h.controller.getHud().daily?.day).toBe(DAY);
    const out = await h.controller.replaceRun(() => {
      resetSim({ seed: "a-loaded-run", mode: "survival" });
    });
    expect(out.ok).toBe(true);
    expect(h.controller.getHud().daily).toBeNull();
    // A run that ends afterwards makes no daily result.
    dispatch({ op: 8 });
    h.frame(50);
    expect(h.controller.getHud().over).toBe("retired");
    expect(h.controller.getHud().daily).toBeNull();
  });

  it("refuses to start a daily while a swap is in progress", async () => {
    const h = makeController();
    h.controller.start();
    h.frame(16);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = h.controller.replaceRun(async () => {
      resetSim({ seed: "built", mode: "survival" });
      await gate;
    });
    h.controller.startDaily(DAY);
    release();
    await pending;
    expect(h.controller.getHud().daily).toBeNull();
  });
});

describe("the incident on a multi-tick frame", () => {
  it("lands on its tick, so the live run is the one a replay plays", () => {
    // Region-outage: its outage falls at 180 s, tick 3600. The strong scripted build
    // survives past it. Frames of 4 ticks after a first of 2 put that tick mid-frame.
    const day = "2026-10-04";
    const incident = dailyRun(day).scheduled[0]?.tick ?? 0;
    expect(incident).toBe(3600);
    const h = started(day);
    h.frame(16);
    h.frame(100);
    expect(S.tick % 4).toBe(2);
    let next = 0;
    while (S.tick < incident + 200) {
      while (next < BOARD.length && (BOARD[next]?.[0] ?? Infinity) <= S.tick) {
        dispatch(BOARD[next++]?.[1] ?? { op: 8 });
      }
      expect(S.over).toBeNull();
      h.frame(200);
    }
    const ticks = S.tick;
    const hash = stateHash();
    const replayed = replay({
      ...dailyReplayOptions(day),
      log: structuredClone(S.log),
      ticks,
    });
    expect(replayed.endedAtTick).toBe(ticks);
    expect(replayed.hash).toBe(hash);
  });
});

describe("a finished daily", () => {
  function playToTheEnd() {
    const h = started();
    let next = 0;
    for (;;) {
      while (next < BOARD.length && (BOARD[next]?.[0] ?? Infinity) <= S.tick) {
        dispatch(BOARD[next++]?.[1] ?? { op: 8 });
      }
      if (S.over) break;
      h.frame(50);
    }
    h.frame(50);
    return h;
  }

  it("hands the board a proof the server's replay accepts at the claimed score", async () => {
    const h = playToTheEnd();
    const result = h.controller.getHud().daily?.result;
    expect(result).toBeTruthy();
    if (!result?.proof) throw new Error("no proof");
    expect(result.day).toBe(DAY);
    expect(result.actions).toBe(S.log.length);
    expect(parseProof(result.proof)).toHaveLength(result.actions);

    const verdict = await createFailoverVerifier({ shadow: false })({
      score: result.score,
      detail: {
        day: dayNumber(DAY),
        seconds: result.seconds,
        ticks: result.ticks,
        actions: result.actions,
      },
      proof: result.proof,
      now: new Date(`${DAY}T12:00:00Z`),
      deadline: Date.now() + 5000,
    });
    expect(verdict).toEqual({ ok: true });
  });

  it("is made once, when the run ends", () => {
    const h = playToTheEnd();
    const first = h.controller.getHud().daily?.result;
    h.frame(50);
    expect(h.controller.getHud().daily?.result).toBe(first);
  });

  it("has no proof when the log passed 700 actions, and says so", () => {
    const h = started();
    for (let i = 0; i < 701; i++) dispatch({ op: 7, on: i % 2 === 0 });
    dispatch({ op: 8 });
    h.frame(50);
    const result = h.controller.getHud().daily?.result;
    expect(result).toMatchObject({ proof: null, actions: 700 });
  });
});

describe("the 900 s cap", () => {
  it("retires a run that is still alive at tick 18000, with a proof that replays", () => {
    const h = started("2026-10-01");
    let next = 0;
    while (!S.over) {
      while (next < BOARD.length && (BOARD[next]?.[0] ?? Infinity) <= S.tick) {
        dispatch(BOARD[next++]?.[1] ?? { op: 8 });
      }
      // Hold the run up: this test is about the cap, not the board.
      S.reputation = 100;
      S.money = Math.max(S.money, 100_000);
      h.frame(250);
    }
    expect(S.over?.reason).toBe("retired");
    expect(S.over?.atTick).toBe(DAILY_MAX_TICKS);
    const result = h.controller.getHud().daily?.result;
    expect(result).toMatchObject({ ticks: DAILY_MAX_TICKS, seconds: 900 });
  });
});
