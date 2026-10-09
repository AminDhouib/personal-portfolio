// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BOARD_S, MID_RUN_S } from "@/components/game/failover/sim/__tests__/scripted";
import { dayNumber, DAILY_MAX_TICKS } from "@/components/game/failover/daily/daily";
import type { LoggedAction } from "@/components/game/failover/sim/action-log";
import { encodeProof } from "@/components/game/failover/sim/proof";
import type { ReplayResult, replayAsync } from "@/components/game/failover/sim/replay";
import { resetSim } from "@/components/game/failover/sim/state";
import { BOARD, record, type Recorded, SHORT } from "./failover-fixtures";
import type { ArcadeVerifyInput } from "../games";
import { VERIFY_BUSY_REASON } from "../verify";

vi.mock("@/lib/log", () => ({ captureException: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));

import { captureException } from "@/lib/log";
import {
  createFailoverVerifier,
  DRIFT_MAX_TICKS,
  DRIFT_MIN_SCORE,
  DRIFT_SCORE_FRACTION,
  judge,
  resetVerifierForTests,
  MAX_PLAUSIBLE_SCORE,
  MAX_WAITING,
  SHADOW,
  SHADOW_SCOPE,
  verifyFailoverRun,
} from "../failover-verify";

const NOW = new Date("2026-10-15T12:00:00Z");
const DAY = "2026-10-15";
const strict = createFailoverVerifier({ shadow: false });

// Real replays run in the tests that are about the sim; the queue, the budget and the reporting
// are tested with a controllable fake replay, so no outcome depends on how fast the host is.
// A slow host only needs the generous test timeout and deadline below.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const GENEROUS_MS = 600_000;

afterEach(() => {
  vi.useRealTimers();
  resetSim({ seed: "after-failover-verify" });
});
beforeEach(() => {
  vi.mocked(captureException).mockClear();
  // Whatever a test left behind (a held mutex, a waiter) must not reach the next one.
  resetVerifierForTests();
});

let dies: Recorded;
let retires: Recorded;

beforeAll(() => {
  dies = record(DAY, BOARD);
  retires = record(DAY, SHORT);
});

function input(run: Recorded, over: Partial<ArcadeVerifyInput> = {}): ArcadeVerifyInput {
  return {
    score: run.score,
    detail: { day: dayNumber(DAY), seconds: run.seconds, ticks: run.ticks, actions: run.actions },
    proof: run.proof,
    now: NOW,
    deadline: Date.now() + GENEROUS_MS,
    ...over,
  };
}

describe("the recordings", () => {
  it("end the ways the verifier has to know", () => {
    expect(dies.endReason).toMatch(/^(reputation|money)$/);
    expect(dies.ticks).toBeLessThan(DAILY_MAX_TICKS);
    expect(retires.endReason).toBe("retired");
    expect(retires.ticks).toBe(400);
    expect(dies.score).toBeGreaterThan(0);
  });
});

describe("an honest run", () => {
  it("that ended in a loss is accepted", async () => {
    expect(await strict(input(dies))).toEqual({ ok: true });
  });

  it("that the player retired is accepted", async () => {
    expect(await strict(input(retires))).toEqual({ ok: true });
  });

  it("is accepted for any day, replayed from that day's own seed and incident", async () => {
    const other = record("2026-10-16", SHORT);
    const verdict = await strict(
      input(other, {
        now: new Date("2026-10-16T01:00:00Z"),
        detail: {
          day: 20261016,
          seconds: other.seconds,
          ticks: other.ticks,
          actions: other.actions,
        },
      }),
    );
    expect(verdict).toEqual({ ok: true });
  });
});

describe("a run that does not replay to its claim", () => {
  it("is refused when the score is one too high", async () => {
    expect(await strict(input(dies, { score: dies.score + 1 }))).toEqual({
      ok: false,
      reason: "score does not match the replay",
    });
  });

  it("is refused when the last action was moved a tick either way", async () => {
    // The retire ends the run, so moving it moves the end away from the claimed tick.
    const last = retires.log.length - 1;
    const moveBy = (delta: number) =>
      retires.log.map((entry, i) =>
        i === last ? ([entry[0] + delta, ...entry.slice(1)] as unknown as LoggedAction) : entry,
      );
    // A tick later is past the end the run claims, so the proof cannot be played at all.
    expect(await strict(input(retires, { proof: encodeProof(moveBy(1)) }))).toEqual({
      ok: false,
      reason: "the proof cannot be played",
    });
    expect(await strict(input(retires, { proof: encodeProof(moveBy(-1)) }))).toEqual({
      ok: false,
      reason: "ticks do not match the replay",
    });
  });

  it("is refused when one action was dropped", async () => {
    const index = dies.log.findIndex((entry) => entry[0] > 0);
    const dropped = dies.log.filter((_entry, i) => i !== index);
    const verdict = await strict(
      input(dies, {
        proof: encodeProof(dropped),
        detail: { ...input(dies).detail, actions: dropped.length },
      }),
    );
    expect(verdict.ok).toBe(false);
  });

  it("is refused when the run was played on another day's seed", async () => {
    // Yesterday's own run, submitted today: its claim is true of yesterday's seed, not today's.
    const yesterday = record("2026-10-14", BOARD);
    expect((await strict(input(yesterday))).ok).toBe(false);
  });

  it("is refused when the claimed tick is not where the run ended", async () => {
    const claim = (ticks: number) =>
      strict(
        input(dies, { detail: { ...input(dies).detail, ticks, seconds: Math.floor(ticks / 20) } }),
      );
    expect(await claim(dies.ticks - 1)).toMatchObject({ ok: false });
    expect(await claim(dies.ticks + 1)).toEqual({
      ok: false,
      reason: "ticks do not match the replay",
    });
  });

  it("is refused when the proof is cut short", async () => {
    const half = dies.log.slice(0, Math.floor(dies.log.length / 2));
    const verdict = await strict(
      input(dies, {
        proof: encodeProof(half),
        detail: { ...input(dies).detail, actions: half.length },
      }),
    );
    expect(verdict.ok).toBe(false);
  });

  it("is refused when it claims a run that was still alive before the cap", async () => {
    // The same board with the retire taken off, cut at 400 ticks: alive there, not capped.
    const alive = record(DAY, BOARD_S, 400);
    expect(alive.endReason).toBe("time");
    expect(await strict(input(alive))).toEqual({
      ok: false,
      reason: "the run was still going at that tick",
    });
  });

  it("is refused when the proof is larger than the action cap", async () => {
    const huge = Array.from({ length: 701 }, () => "0,8").join(",");
    const verdict = await strict(
      input(retires, { proof: huge, detail: { ...input(retires).detail, actions: 701 } }),
    );
    expect(verdict).toEqual({ ok: false, reason: "unreadable proof" });
  });
});

describe("a claim that is wrong on its face", () => {
  const cases: Array<[string, Partial<ArcadeVerifyInput>, string]> = [
    ["no proof", { proof: null }, "proof required"],
    ["yesterday", { now: new Date("2026-10-16T00:00:00Z") }, "not today's run"],
    ["tomorrow", { now: new Date("2026-10-14T23:59:59Z") }, "not today's run"],
    ["a proof that is not one", { proof: "not,a,proof" }, "unreadable proof"],
  ];
  for (const [name, over, reason] of cases) {
    it(`is refused for ${name}, with a stable reason`, async () => {
      expect(await strict(input(retires, over))).toEqual({ ok: false, reason });
    });
  }

  it("is refused when the seconds are not the ticks over twenty", async () => {
    expect(
      await strict(input(retires, { detail: { ...input(retires).detail, seconds: 21 } })),
    ).toEqual({ ok: false, reason: "seconds do not match the ticks" });
  });

  it("is refused when the ticks pass the 900 s cap", async () => {
    expect(
      await strict(
        input(retires, {
          detail: { ...input(retires).detail, ticks: DAILY_MAX_TICKS + 1, seconds: 900 },
        }),
      ),
    ).toEqual({ ok: false, reason: "ticks out of range" });
  });

  it("is refused when the action count is not the proof's", async () => {
    expect(
      await strict(input(retires, { detail: { ...input(retires).detail, actions: 0 } })),
    ).toEqual({ ok: false, reason: "action count does not match the proof" });
  });
});

describe("judge", () => {
  const result = (over: Partial<Parameters<typeof judge>[0]> = {}) => ({
    endedAtTick: 100,
    endReason: "reputation" as const,
    seconds: 5,
    score: 50,
    hash: 1,
    ...over,
  });
  const detail = { ticks: 100 } as Record<string, number>;

  it("accepts a loss, a retire and a run alive at the 900 s cap", () => {
    expect(judge(result(), 50, detail)).toEqual({ ok: true });
    expect(judge(result({ endReason: "retired" }), 50, detail)).toEqual({ ok: true });
    expect(
      judge(result({ endedAtTick: DAILY_MAX_TICKS, endReason: "time" }), 50, {
        ticks: DAILY_MAX_TICKS,
      }),
    ).toEqual({ ok: true });
  });

  it("calls a replay close to its claim drift, and one far from it a plain refusal", () => {
    expect(judge(result({ endedAtTick: 120 }), 50, detail)).toMatchObject({ drift: true });
    expect(judge(result({ endedAtTick: 121 }), 50, detail)).toMatchObject({ drift: false });
    expect(judge(result({ score: 5000 }), 5100, detail)).toMatchObject({ drift: true });
    expect(judge(result({ score: 5000 }), 5101, detail)).toMatchObject({ drift: false });
    expect(judge(result({ score: 10 }), 60, detail)).toMatchObject({ drift: true });
    expect(judge(result({ score: 10 }), 61, detail)).toMatchObject({ drift: false });
  });

  it("refuses alive-before-the-cap, a different end tick and a different score", () => {
    expect(judge(result({ endReason: "time" }), 50, detail)).toMatchObject({ ok: false });
    expect(judge(result({ endedAtTick: 99 }), 50, detail)).toMatchObject({
      reason: "ticks do not match the replay",
    });
    expect(judge(result(), 51, detail)).toMatchObject({
      reason: "score does not match the replay",
    });
  });
});

type Replay = typeof replayAsync;

/** What a faithful replay of this recording reports. */
function faithful(run: Recorded, over: Partial<ReplayResult> = {}): ReplayResult {
  return {
    endedAtTick: run.ticks,
    endReason: run.endReason === "retired" ? "retired" : "reputation",
    seconds: run.seconds,
    score: run.score,
    hash: 0,
    ...over,
  };
}

/** A replay that answers at once with a fixed result. */
const answering =
  (result: ReplayResult): Replay =>
  async () =>
    result;

/** A replay the test finishes by hand, one call at a time. */
function gated() {
  const started: Array<(result: ReplayResult) => void> = [];
  const replay: Replay = () => new Promise<ReplayResult>((resolve) => started.push(resolve));
  return { replay, started };
}

/** Let the queue hand out turns: a few trips round the event loop. */
async function settle() {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
}

describe("the rollout switch", () => {
  it("is on for the first release", () => {
    expect(SHADOW).toBe(true);
  });

  it("refuses the empty proof that claims a big score, the exploit SHADOW once let through", async () => {
    const forged = input(retires, {
      proof: "",
      score: 200_000,
      detail: { ...input(retires).detail, actions: 0 },
    });
    expect((await verifyFailoverRun(forged)).ok).toBe(false);
    expect((await strict(forged)).ok).toBe(false);
    expect(captureException).not.toHaveBeenCalled();
  });

  const retiresAt = (ticks: number) =>
    input(retires, {
      detail: { ...input(retires).detail, ticks, seconds: Math.floor(ticks / 20) },
    });

  it("accepts a replay a tick off with a near score under SHADOW, and refuses it when SHADOW is off", async () => {
    expect(await verifyFailoverRun(retiresAt(retires.ticks + 1))).toEqual({ ok: true });
    expect(await strict(retiresAt(retires.ticks + 1))).toMatchObject({ ok: false });
  });

  it("accepts a replay that ends 20 ticks off and refuses one that ends 21 off", async () => {
    expect(await verifyFailoverRun(retiresAt(retires.ticks + 20))).toEqual({ ok: true });
    expect(await verifyFailoverRun(retiresAt(retires.ticks + 21))).toEqual({
      ok: false,
      reason: "ticks do not match the replay",
    });
  });

  it("names its drift bounds in one place: 20 ticks, and max(50, 2%) of the score", () => {
    expect([DRIFT_MAX_TICKS, DRIFT_MIN_SCORE, DRIFT_SCORE_FRACTION]).toEqual([20, 50, 0.02]);
  });

  describe("the score allowance, max(50, 2%) of the replay's score, on both sides", () => {
    // Fixed replays, so the edge is exact: 2% of 10,000 is 200; of 1,000 the floor of 50 rules.
    const claim = (replayScore: number, claimed: number) =>
      createFailoverVerifier({
        shadow: true,
        replay: answering(faithful(retires, { score: replayScore })),
      })(input(retires, { score: claimed }));

    it("accepts a claim up to the allowance above the replay and refuses one past it", async () => {
      expect(await claim(10_000, 10_200)).toEqual({ ok: true });
      expect(await claim(10_000, 10_201)).toEqual({
        ok: false,
        reason: "score does not match the replay",
      });
      expect(await claim(1_000, 1_050)).toEqual({ ok: true });
      expect((await claim(1_000, 1_051)).ok).toBe(false);
    });

    it("accepts a claim up to the allowance below the replay and refuses one past it", async () => {
      expect(await claim(10_000, 9_800)).toEqual({ ok: true });
      expect(await claim(10_000, 9_799)).toEqual({
        ok: false,
        reason: "score does not match the replay",
      });
      expect(await claim(1_000, 950)).toEqual({ ok: true });
      expect((await claim(1_000, 949)).ok).toBe(false);
    });
  });

  it("accepts and reports a mismatch that is only drift while it is on", async () => {
    const lie = input(retires, { score: retires.score + 1 });
    expect(await verifyFailoverRun(lie)).toEqual({ ok: true });
    expect(captureException).toHaveBeenCalledTimes(1);
    const [scope, error] = vi.mocked(captureException).mock.calls[0] ?? [];
    expect(scope).toBe(SHADOW_SCOPE);
    expect((error as Error).message).toBe(
      "failover replay disagrees: score does not match the replay",
    );
  });

  it("still refuses a mismatch over the ceiling, and says nothing", async () => {
    const lie = input(retires, { score: MAX_PLAUSIBLE_SCORE + 1 });
    expect(await verifyFailoverRun(lie)).toEqual({
      ok: false,
      reason: "score does not match the replay",
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("still refuses a claim that is wrong on its face", async () => {
    expect(await verifyFailoverRun(input(retires, { proof: null }))).toEqual({
      ok: false,
      reason: "proof required",
    });
    expect(await verifyFailoverRun(input(retires, { proof: "garbage" }))).toEqual({
      ok: false,
      reason: "unreadable proof",
    });
  });
});

describe("running out of time", () => {
  it("answers busy, never accepted, when the deadline has passed before the replay starts", async () => {
    const replay = vi.fn<Replay>();
    const late = input(retires, { deadline: Date.now() - 1, score: 150_000 });
    for (const shadow of [true, false]) {
      expect(await createFailoverVerifier({ shadow, replay })(late)).toEqual({
        ok: false,
        reason: VERIFY_BUSY_REASON,
      });
    }
    expect(replay).not.toHaveBeenCalled();
  });

  it("answers busy when the deadline passes in the middle of a replay, and frees the mutex", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
    const slow: Replay = async (_options, { yieldFn }) => {
      vi.setSystemTime(NOW.getTime() + 10_000);
      await yieldFn();
      return faithful(retires);
    };
    const verdict = await createFailoverVerifier({ shadow: true, replay: slow })(
      input(retires, { deadline: NOW.getTime() + 8_000 }),
    );
    expect(verdict).toEqual({ ok: false, reason: VERIFY_BUSY_REASON });
    // The mutex is free again: the next caller starts at once.
    const next = gated();
    void createFailoverVerifier({ shadow: true, replay: next.replay })(input(retires));
    await settle();
    expect(next.started).toHaveLength(1);
  });
});

describe("reporting", () => {
  const drifting = createFailoverVerifier({
    shadow: true,
    replay: async () => faithful(retires, { score: retires.score - 1 }),
  });
  const driftingTicks = createFailoverVerifier({
    shadow: true,
    replay: async () => faithful(retires, { endedAtTick: retires.ticks - 1 }),
  });

  it("tells Sentry of one reason at most once a minute, and each reason on its own", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const run = () => input(retires, { deadline: Date.now() + GENEROUS_MS });
    await drifting(run());
    await drifting(run());
    expect(captureException).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2030-01-01T00:00:30Z"));
    await drifting(run());
    expect(captureException).toHaveBeenCalledTimes(1);

    // A different reason is not held back by the first.
    await driftingTicks(run());
    expect(captureException).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date("2030-01-01T00:01:01Z"));
    await drifting(run());
    expect(captureException).toHaveBeenCalledTimes(3);
  });
});

describe("taking turns", () => {
  const verifier = (replay: Replay) => createFailoverVerifier({ shadow: false, replay });

  it("lets one replay run, two wait, and answers busy to the rest", async () => {
    expect(MAX_WAITING).toBe(2);
    const { replay, started } = gated();
    const verify = verifier(replay);
    const calls = Array.from({ length: MAX_WAITING + 2 }, () => verify(input(retires)));
    await settle();
    // Only the first has started; the fourth was turned away at the door.
    expect(started).toHaveLength(1);
    expect(await calls[MAX_WAITING + 1]).toEqual({ ok: false, reason: VERIFY_BUSY_REASON });

    for (let i = 0; i < MAX_WAITING + 1; i++) {
      started[i]?.(faithful(retires));
      await settle();
      expect(started).toHaveLength(Math.min(i + 2, MAX_WAITING + 1));
    }
    expect(await Promise.all(calls.slice(0, MAX_WAITING + 1))).toEqual([
      { ok: true },
      { ok: true },
      { ok: true },
    ]);
  });

  it("leaves the queue empty afterwards, so the next caller runs at once", async () => {
    const { replay, started } = gated();
    const verify = verifier(replay);
    const first = Array.from({ length: MAX_WAITING + 1 }, () => verify(input(retires)));
    for (let i = 0; i <= MAX_WAITING; i++) {
      await settle();
      started[i]?.(faithful(retires));
    }
    await Promise.all(first);
    void verify(input(retires));
    await settle();
    expect(started).toHaveLength(MAX_WAITING + 2);
  });

  it("frees the slot of a waiter whose deadline passed, and never starts its replay", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
    const { replay, started } = gated();
    const verify = verifier(replay);
    // A runs. B and C wait with a 10 ms deadline.
    const a = verify(input(retires, { deadline: NOW.getTime() + 60_000 }));
    const b = verify(input(retires, { deadline: NOW.getTime() + 10 }));
    const c = verify(input(retires, { deadline: NOW.getTime() + 10 }));
    await vi.advanceTimersByTimeAsync(11);
    expect(await b).toEqual({ ok: false, reason: VERIFY_BUSY_REASON });
    expect(await c).toEqual({ ok: false, reason: VERIFY_BUSY_REASON });
    expect(started).toHaveLength(1);

    // D and E fit the queue the two gave up; F is the one turned away.
    const d = verify(input(retires, { deadline: NOW.getTime() + 60_000 }));
    const e = verify(input(retires, { deadline: NOW.getTime() + 60_000 }));
    const f = verify(input(retires, { deadline: NOW.getTime() + 60_000 }));
    expect(await f).toEqual({ ok: false, reason: VERIFY_BUSY_REASON });

    for (let i = 0; i < 3; i++) {
      await settle();
      started[i]?.(faithful(retires));
    }
    expect(await Promise.all([a, d, e])).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(started).toHaveLength(3);
  });

  it("clears a held mutex and the queue on reset, so a test cannot cascade", async () => {
    const { replay, started } = gated();
    const verify = verifier(replay);
    void verify(input(retires));
    const waiter = verify(input(retires));
    await settle();
    expect(started).toHaveLength(1);

    resetVerifierForTests();
    expect(await waiter).toEqual({ ok: false, reason: VERIFY_BUSY_REASON });
    void verify(input(retires));
    await settle();
    expect(started).toHaveLength(2);
  });
});

describe("with the real sim", () => {
  it("gives the event loop a turn during a long replay", async () => {
    const order: string[] = [];
    setTimeout(() => order.push("timer"), 0);
    const began = performance.now();
    await strict(input(dies));
    order.push("done");
    console.info(
      `failover verify timing: honest ${dies.ticks}-tick run replayed in ${Math.round(performance.now() - began)} ms`,
    );
    expect(order).toEqual(["timer", "done"]);
  });

  it("accepts an honest run that ended in a loss at its real score", async () => {
    expect(await strict(input(dies))).toEqual({ ok: true });
  });
});

describe("a strong honest run", () => {
  it("that scores past the old 209,000 cap is accepted at its real score, shadow or not", async () => {
    // The scripted data-import build survives the full 900 s; it scored 224,349 on 2026-10-09.
    const day = "2026-10-01";
    const strong = record(day, [...BOARD_S, ...MID_RUN_S]);
    expect(strong.score).toBeGreaterThan(209_000);
    expect(strong.endReason).toBe("time");
    const claim = input(strong, {
      now: new Date(`${day}T12:00:00Z`),
      detail: {
        day: dayNumber(day),
        seconds: strong.seconds,
        ticks: strong.ticks,
        actions: strong.actions,
      },
    });
    const began = performance.now();
    expect(await strict(claim)).toEqual({ ok: true });
    console.info(
      `failover verify timing: worst-case honest run, ${strong.ticks} ticks, ${strong.actions} actions, replayed in ${Math.round(performance.now() - began)} ms`,
    );
    expect(await verifyFailoverRun(claim)).toEqual({ ok: true });
    expect(captureException).not.toHaveBeenCalled();
  });
});
