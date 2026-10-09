// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOARD_S } from "@/components/game/failover/sim/__tests__/scripted";
import { dayNumber, DAILY_MAX_TICKS } from "@/components/game/failover/daily/daily";
import type { LoggedAction } from "@/components/game/failover/sim/action-log";
import { encodeProof } from "@/components/game/failover/sim/proof";
import { resetSim } from "@/components/game/failover/sim/state";
import { BOARD, record, type Recorded, SHORT } from "./failover-fixtures";
import type { ArcadeVerifyInput } from "../games";
import { VERIFY_BUSY_REASON } from "../verify";

vi.mock("@/lib/log", () => ({ captureException: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));

import { captureException } from "@/lib/log";
import {
  createFailoverVerifier,
  judge,
  MAX_PLAUSIBLE_SCORE,
  MAX_WAITING,
  SHADOW,
  SHADOW_SCOPE,
  verifyFailoverRun,
} from "../failover-verify";

const NOW = new Date("2026-10-15T12:00:00Z");
const DAY = "2026-10-15";
const strict = createFailoverVerifier({ shadow: false });

afterEach(() => resetSim({ seed: "after-failover-verify" }));
beforeEach(() => vi.mocked(captureException).mockClear());

let dies: Recorded;
let retires: Recorded;

beforeEach(() => {
  dies ??= record(DAY, BOARD);
  retires ??= record(DAY, SHORT);
});

function input(run: Recorded, over: Partial<ArcadeVerifyInput> = {}): ArcadeVerifyInput {
  return {
    score: run.score,
    detail: { day: dayNumber(DAY), seconds: run.seconds, ticks: run.ticks, actions: run.actions },
    proof: run.proof,
    now: NOW,
    deadline: Date.now() + 2_000,
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

describe("the rollout switch", () => {
  it("is on for the first release", () => {
    expect(SHADOW).toBe(true);
  });

  it("accepts and reports a mismatch under the plausibility ceiling while it is on", async () => {
    const lie = input(dies, { score: dies.score + 1 });
    expect(await verifyFailoverRun(lie)).toEqual({ ok: true });
    expect(captureException).toHaveBeenCalledTimes(1);
    const [scope, error] = vi.mocked(captureException).mock.calls[0] ?? [];
    expect(scope).toBe(SHADOW_SCOPE);
    expect((error as Error).message).toBe(
      "failover replay disagrees: score does not match the replay",
    );
  });

  it("still refuses a mismatch over the ceiling, and says nothing", async () => {
    const lie = input(dies, { score: MAX_PLAUSIBLE_SCORE + 1 });
    expect(await verifyFailoverRun(lie)).toEqual({
      ok: false,
      reason: "score does not match the replay",
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("still refuses a claim that is wrong on its face, and a busy answer", async () => {
    expect(await verifyFailoverRun(input(dies, { proof: null }))).toEqual({
      ok: false,
      reason: "proof required",
    });
    expect(await verifyFailoverRun(input(dies, { proof: "garbage" }))).toEqual({
      ok: false,
      reason: "unreadable proof",
    });
  });

  it("accepts a replay that ran out of time, and reports it", async () => {
    const verdict = await verifyFailoverRun(input(dies, { deadline: Date.now() - 1 }));
    expect(verdict).toEqual({ ok: true });
    expect(vi.mocked(captureException).mock.calls[0]?.[1]).toEqual(
      new Error("failover replay disagrees: ran out of time"),
    );
  });

  it("refuses for the same reasons the moment it is off", async () => {
    expect(await strict(input(dies, { deadline: Date.now() - 1 }))).toEqual({
      ok: false,
      reason: "ran out of time",
    });
  });
});

describe("taking turns", () => {
  it("lets one replay run, three wait, and answers busy to the rest", async () => {
    const verdicts = await Promise.all(
      Array.from({ length: MAX_WAITING + 2 }, () => strict(input(retires))),
    );
    expect(verdicts.filter((v) => v.ok)).toHaveLength(MAX_WAITING + 1);
    expect(verdicts.filter((v) => !v.ok)).toEqual([{ ok: false, reason: VERIFY_BUSY_REASON }]);
  });

  it("leaves the queue empty afterwards, so the next caller runs at once", async () => {
    await Promise.all(Array.from({ length: MAX_WAITING + 2 }, () => strict(input(retires))));
    expect(await strict(input(retires))).toEqual({ ok: true });
  });

  it("does not start a replay for a caller whose deadline passed while it waited", async () => {
    const [first, late] = await Promise.all([
      strict(input(dies)),
      strict(input(retires, { deadline: Date.now() + 1 })),
    ]);
    expect(first).toEqual({ ok: true });
    expect(late).toEqual({ ok: false, reason: "ran out of time" });
  });

  it("gives the event loop a turn during a long replay", async () => {
    const order: string[] = [];
    setTimeout(() => order.push("timer"), 0);
    await strict(input(dies));
    order.push("done");
    expect(order).toEqual(["timer", "done"]);
  });
});
