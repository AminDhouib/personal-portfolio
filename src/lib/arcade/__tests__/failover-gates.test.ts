// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dailyReplayOptions,
  DAILY_MAX_TICKS,
  dayNumber,
  profileFor,
} from "@/components/game/failover/daily/daily";
import { PROFILES } from "@/components/game/failover/daily/profiles";
import { encodeAction, type LoggedAction } from "@/components/game/failover/sim/action-log";
import { CONFIG, TICK } from "@/components/game/failover/sim/config";
import { encodeProof, parseProof } from "@/components/game/failover/sim/proof";
import { replay, replayAsync, type ReplayResult } from "@/components/game/failover/sim/replay";
import { resetSim, S } from "@/components/game/failover/sim/state";
import {
  BOARD_A,
  BOARD_B,
  BOARD_C,
  BOARD_S,
} from "@/components/game/failover/sim/__tests__/scripted";
import { BOARD, record, type Recorded, SHORT } from "./failover-fixtures";
import type { ArcadeVerifyInput } from "../games";
import { VERIFY_BUSY_REASON } from "../verify";

vi.mock("@/lib/log", () => ({ captureException: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));

import {
  admitReplay,
  clearReplayCache,
  NO_ENTRY_LINK_MAX_TICKS,
  RECENT_REPLAYS_MAX,
  recentReplay,
  REPLAY_ERROR_REASON,
  REPLAY_GLOBAL_LIMIT,
  REPLAY_PER_CLIENT_LIMIT,
  REPLAY_WINDOW_MS,
  replayKey,
  rememberReplay,
  structuralReason,
  TICKS_MISMATCH_REASON,
} from "../failover-gates";
import { createFailoverVerifier, MAX_WAITING, resetVerifierForTests } from "../failover-verify";
import { checkRateLimit } from "@/lib/rate-limit";
import { VERIFY_RATE_LIMITED_REASON } from "../verify-reasons";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const NOW = new Date("2026-10-15T12:00:00Z");
const DAY = "2026-10-15";
const GENEROUS_MS = 600_000;

let dies: Recorded;
let retires: Recorded;

beforeAll(() => {
  dies = record(DAY, BOARD);
  retires = record(DAY, SHORT);
});

beforeEach(() => {
  resetVerifierForTests();
  clearReplayCache();
});

afterEach(() => {
  vi.useRealTimers();
  resetSim({ seed: "after-failover-gates" });
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

/** A claim built by hand: the shape of a hostile request, with numbers that agree with each other. */
function claim(
  proof: string,
  { ticks, score }: { ticks: number; score: number },
): ArcadeVerifyInput {
  const log = parseProof(proof);
  return {
    score,
    detail: {
      day: dayNumber(DAY),
      seconds: Math.floor(ticks / 20),
      ticks,
      actions: log?.length ?? 0,
    },
    proof,
    now: NOW,
    deadline: Date.now() + GENEROUS_MS,
  };
}

/** The gates read the log the way the verifier does: from the proof string. */
function logOf(run: Recorded): LoggedAction[] {
  const log = parseProof(run.proof);
  if (!log) throw new Error("fixture proof does not parse");
  return log;
}

// ---- the bounds, pinned to the sim they come from ---------------------------------------

describe("the bounds come from the sim", () => {
  it("rests on a fresh survival run starting at 100 reputation and 0.5 requests a second", () => {
    resetSim({ seed: "gates-pin", mode: "survival" });
    expect(S.reputation).toBe(100);
    expect(S.currentRPS).toBe(0.5);
    expect(CONFIG.survival.SCORE_POINTS.FAIL_REPUTATION).toBe(-1);
    expect(CONFIG.survival.baseRPS).toBeGreaterThanOrEqual(0.5);
    expect(TICK).toBe(0.05);
  });

  it("writes a link from the Internet with 0 as its first argument", () => {
    expect(encodeAction(7, { op: 1, from: "internet", to: "svc_3" })).toEqual([7, 1, 0, 3]);
  });

  it("derives the no-entry-link bound as 100 failed requests at the slowest arrival rate", () => {
    // 100 reputation / 1 per failed request / 0.5 requests a second = 200 s = 4000 ticks, plus two
    // seconds of slack for the spawn clock.
    expect(NO_ENTRY_LINK_MAX_TICKS).toBe(4000 + 40);
  });

  it("holds for every profile: a board with no entry link is dead well before the bound", () => {
    // One empty-board replay per profile, found by walking days until every profile has shown up.
    const seen = new Set<string>();
    for (let n = 0; n < 400 && seen.size < PROFILES.length; n++) {
      const day = new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);
      const profile = profileFor(day);
      if (seen.has(profile.id)) continue;
      seen.add(profile.id);
      const result = replay({ ...dailyReplayOptions(day), log: [], ticks: DAILY_MAX_TICKS });
      expect(result.endReason, profile.id).not.toBe("time");
      expect(result.endedAtTick, profile.id).toBeLessThan(NO_ENTRY_LINK_MAX_TICKS);
    }
    expect(seen.size).toBe(PROFILES.length);
  });
});

// ---- structure: nothing a client run can fail --------------------------------------------

describe("structuralReason", () => {
  it("passes every honest run, at its own claim", () => {
    for (const run of [dies, retires]) {
      expect(structuralReason(logOf(run), run.ticks), run.endReason).toBeNull();
    }
  });

  it("passes honest runs from the other boards, other days and other lengths", () => {
    const boards = { A: BOARD_A, B: BOARD_B, C: BOARD_C, S: BOARD_S };
    for (const [name, board] of Object.entries(boards)) {
      for (const day of ["2026-10-15", "2026-10-16", "2026-11-02"]) {
        for (const until of [200, 1200]) {
          const run = record(day, board, until);
          expect(structuralReason(logOf(run), run.ticks), `${name} ${day} ${until}`).toBeNull();
        }
      }
    }
  });

  it("passes an honest log claimed alive at the 900 s cap with the score it earned by then", () => {
    // The gate is pure on (log, ticks): a board that links the Internet may claim any end.
    const run = record(DAY, BOARD_S, 400);
    expect(structuralReason(logOf(run), DAILY_MAX_TICKS)).toBeNull();
  });

  it("passes an empty log that claims a death inside the no-entry-link bound", () => {
    expect(structuralReason([], 20)).toBeNull();
    expect(structuralReason([], NO_ENTRY_LINK_MAX_TICKS)).toBeNull();
  });

  it("refuses an action later than the claimed end, as the replay would", () => {
    const log: LoggedAction[] = [
      [0, 8],
      [100, 8],
    ];
    expect(structuralReason(log, 99)).toBe(REPLAY_ERROR_REASON);
    expect(structuralReason(log, 100)).toBeNull();
  });

  it("refuses an entry the game could not have logged, as the replay would", () => {
    // parseProof reads these (right arity), decodeAction does not: id 0 is the Internet, 2 is no bool.
    for (const proof of ["0,3,0", "0,4,0", "0,7,2", "0,5,0", "0,6,0"]) {
      const log = parseProof(proof);
      expect(log, proof).not.toBeNull();
      expect(structuralReason(log ?? [], 100), proof).toBe(REPLAY_ERROR_REASON);
    }
  });

  it("refuses a run past the no-entry-link bound whose log never links the Internet", () => {
    const placeOnly = parseProof(encodeProof([[0, 0, 0, 0, 0]]));
    expect(placeOnly).not.toBeNull();
    const ticks = NO_ENTRY_LINK_MAX_TICKS + 1;
    expect(structuralReason(placeOnly ?? [], ticks)).toBe(TICKS_MISMATCH_REASON);
    expect(structuralReason([], DAILY_MAX_TICKS)).toBe(TICKS_MISMATCH_REASON);
    // A link that does not start at the Internet is not an entry link.
    const inner = parseProof(encodeProof([[0, 1, 1, 2]]));
    expect(structuralReason(inner ?? [], ticks)).toBe(TICKS_MISMATCH_REASON);
    // A link from the Internet to a service nobody has placed (yet) is not one either.
    const unplaced = parseProof(encodeProof([[0, 1, 0, 1]]));
    expect(structuralReason(unplaced ?? [], ticks)).toBe(TICKS_MISMATCH_REASON);
    const early = parseProof(
      encodeProof([
        [0, 1, 0, 1],
        [1, 0, 0, 0, 0],
      ]),
    );
    expect(structuralReason(early ?? [], ticks)).toBe(TICKS_MISMATCH_REASON);
    const beyond = parseProof(
      encodeProof([
        [0, 0, 0, 0, 0],
        [1, 1, 0, 2],
      ]),
    );
    expect(structuralReason(beyond ?? [], ticks)).toBe(TICKS_MISMATCH_REASON);
    // A placement and a link from the Internet to it is enough to pass the gate.
    const linked = parseProof(
      encodeProof([
        [0, 0, 0, 0, 0],
        [1, 1, 0, 1],
      ]),
    );
    expect(structuralReason(linked ?? [], ticks)).toBeNull();
  });
});

// ---- the verifier with the gates in front of the replay ----------------------------------

describe("the verifier refuses hostile shapes without replaying", () => {
  function spied() {
    const spy = vi.fn(replayAsync);
    return { spy, strict: createFailoverVerifier({ shadow: false, replay: spy }) };
  }

  const hostile: Array<[string, () => ArcadeVerifyInput, string]> = [
    [
      "a full-length run with an empty log",
      () => claim("", { ticks: DAILY_MAX_TICKS, score: 9_000 }),
      TICKS_MISMATCH_REASON,
    ],
    [
      "a full-length run whose small proof never links the Internet",
      () => claim(encodeProof([[0, 0, 0, 0, 0]]), { ticks: DAILY_MAX_TICKS, score: 9_000 }),
      TICKS_MISMATCH_REASON,
    ],
    [
      "an action after the claimed end",
      () => {
        // The end claimed one tick before the last action in the log.
        const before = (dies.log.at(-1)?.[0] ?? 2) - 1;
        return claim(dies.proof, { ticks: before, score: 10 * Math.floor(before / 20) + 5 });
      },
      REPLAY_ERROR_REASON,
    ],
    [
      "an entry the game could not have logged",
      () => claim("0,3,0", { ticks: 100, score: 50 }),
      REPLAY_ERROR_REASON,
    ],
  ];

  for (const [name, build, reason] of hostile) {
    it(`${name}: refused with a stable reason, replay never called, strict`, async () => {
      const { spy, strict } = spied();
      expect(await strict(build())).toEqual({ ok: false, reason });
      expect(spy).not.toHaveBeenCalled();
    });

    it(`${name}: refused with SHADOW on too, replay never called`, async () => {
      const spy = vi.fn(replayAsync);
      const shadowed = createFailoverVerifier({ shadow: true, replay: spy });
      expect(await shadowed(build())).toEqual({ ok: false, reason });
      expect(spy).not.toHaveBeenCalled();
    });
  }

  it("does not take the replay's turn for them", async () => {
    // A held mutex would answer busy; a structural refusal never gets as far as the queue.
    const { spy, strict } = spied();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = vi.fn(async (...args: Parameters<typeof replayAsync>) => {
      await gate;
      return replayAsync(...args);
    });
    const holder = createFailoverVerifier({ shadow: false, replay: slow });
    const running = holder(input(retires));
    await vi.waitFor(() => expect(slow).toHaveBeenCalled());
    expect(await strict(claim("", { ticks: DAILY_MAX_TICKS, score: 9_000 }))).toEqual({
      ok: false,
      reason: TICKS_MISMATCH_REASON,
    });
    release();
    expect(await running).toEqual({ ok: true });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("an honest run passes every new gate and is replayed", () => {
  it("accepts a loss, a retire and a SHADOW run, each through exactly one replay", async () => {
    for (const shadow of [false, true]) {
      for (const run of [dies, retires]) {
        clearReplayCache();
        const spy = vi.fn(replayAsync);
        const verify = createFailoverVerifier({ shadow, replay: spy });
        const client = `10.99.0.${shadow ? 1 : 2}`;
        expect(await verify(input(run, { client })), `${run.endReason} shadow=${shadow}`).toEqual({
          ok: true,
        });
        expect(spy).toHaveBeenCalledTimes(1);
      }
    }
  });

  it("still takes a SHADOW run that lands within the drift bounds", async () => {
    const spy = vi.fn(replayAsync);
    const verify = createFailoverVerifier({ shadow: true, replay: spy });
    // Honest claim, replay off by a few points: the drift rule, untouched by the gates.
    const verdict = await verify(input(dies, { score: dies.score + 3, client: "10.99.0.3" }));
    expect(verdict).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ---- the replay cache --------------------------------------------------------------------

describe("remembered replays", () => {
  it("keys on the day, the claimed ticks and the proof, and on nothing else", () => {
    const a = replayKey(DAY, 400, "0,8");
    expect(a).toBe(replayKey(DAY, 400, "0,8"));
    expect(a).not.toBe(replayKey("2026-10-16", 400, "0,8"));
    expect(a).not.toBe(replayKey(DAY, 401, "0,8"));
    expect(a).not.toBe(replayKey(DAY, 400, "1,8"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("holds the most recent results, oldest out first, and a read counts as a use", () => {
    const result = (n: number) => ({
      endedAtTick: n,
      endReason: "time" as const,
      seconds: n / 20,
      score: n,
      hash: n,
    });
    for (let n = 0; n < RECENT_REPLAYS_MAX; n++) rememberReplay(`k${n}`, result(n));
    expect(recentReplay("k0")?.endedAtTick).toBe(0);
    rememberReplay("extra", result(999));
    expect(recentReplay("k0")?.endedAtTick).toBe(0);
    expect(recentReplay("k1")).toBeUndefined();
    expect(recentReplay("extra")?.endedAtTick).toBe(999);
  });

  it("replays a wrong claim once, then answers the same proof from memory, whatever score it claims", async () => {
    const spy = vi.fn(replayAsync);
    const strict = createFailoverVerifier({ shadow: false, replay: spy });
    const wrong = input(retires, { score: retires.score + 500 });
    const reason = "score does not match the replay";
    expect(await strict(wrong)).toEqual({ ok: false, reason });
    expect(await strict(wrong)).toEqual({ ok: false, reason });
    expect(await strict({ ...wrong, score: retires.score + 501 })).toEqual({ ok: false, reason });
    expect(spy).toHaveBeenCalledTimes(1);
    // The honest claim for the same proof is answered from the same memory, and passes.
    expect(await strict(input(retires))).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("gives the same verdict from memory as from the replay, drift included", async () => {
    const spy = vi.fn(replayAsync);
    const shadowed = createFailoverVerifier({ shadow: true, replay: spy });
    const drifted = input(retires, { score: retires.score + 3 });
    const first = await shadowed(drifted);
    const second = await shadowed(drifted);
    expect(first).toEqual({ ok: true });
    expect(second).toEqual(first);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not remember a replay that ran out of time, or one that threw", async () => {
    // Out of time: the clock passes the deadline in the middle of the first replay.
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
    let first = true;
    const slow = vi.fn(async (...args: Parameters<typeof replayAsync>) => {
      if (first) {
        first = false;
        vi.setSystemTime(NOW.getTime() + 10_000);
        await args[1].yieldFn();
      }
      return replayAsync(...args);
    });
    const patient = createFailoverVerifier({ shadow: false, replay: slow });
    expect(await patient(input(retires, { deadline: NOW.getTime() + 8_000 }))).toEqual({
      ok: false,
      reason: VERIFY_BUSY_REASON,
    });
    // Not remembered: the same claim is replayed again, and passes.
    expect(await patient(input(retires, { deadline: NOW.getTime() + 600_000 }))).toEqual({
      ok: true,
    });
    expect(slow).toHaveBeenCalledTimes(2);
    vi.useRealTimers();

    // A replay that threw.
    clearReplayCache();
    const calls: string[] = [];
    const flaky = vi.fn(async (...args: Parameters<typeof replayAsync>) => {
      calls.push("call");
      if (calls.length === 1) throw new Error("boom");
      return replayAsync(...args);
    });
    const strict = createFailoverVerifier({ shadow: false, replay: flaky });
    expect(await strict(input(retires))).toEqual({ ok: false, reason: "the replay failed" });
    expect(await strict(input(retires))).toEqual({ ok: true });
    expect(flaky).toHaveBeenCalledTimes(2);
  });

  it("does not answer one day's proof from another day's memory", async () => {
    const spy = vi.fn(replayAsync);
    const strict = createFailoverVerifier({ shadow: false, replay: spy });
    // Refused, so remembered under its own day.
    expect(await strict(input(retires, { score: retires.score + 500 })).then((v) => v.ok)).toBe(
      false,
    );
    const other = record("2026-10-16", SHORT);
    // The same actions on another day: the proof text and the ticks are the same, the day is not.
    expect(other.proof).toBe(retires.proof);
    expect(other.ticks).toBe(retires.ticks);
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
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

// ---- the replay-attempt cap --------------------------------------------------------------

describe("the replay-attempt cap", () => {
  beforeEach(() => {
    // clearReplayCache (top-level beforeEach) starts new limiter keys; the clock is the test's to move.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  it("allows an honest player's few attempts a minute", () => {
    expect(REPLAY_PER_CLIENT_LIMIT).toBeGreaterThanOrEqual(5);
    for (let n = 0; n < REPLAY_PER_CLIENT_LIMIT; n++) {
      expect(admitReplay("10.1.0.1").allowed).toBe(true);
    }
  });

  it("stops one client past its limit, with a Retry-After, and leaves other clients alone", () => {
    for (let n = 0; n < REPLAY_PER_CLIENT_LIMIT; n++) admitReplay("10.1.0.2");
    const over = admitReplay("10.1.0.2");
    expect(over.allowed).toBe(false);
    expect(over.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(over.retryAfterSeconds).toBeLessThanOrEqual(REPLAY_WINDOW_MS / 1000);
    expect(admitReplay("10.1.0.3").allowed).toBe(true);
  });

  it("stops everyone past the global limit, however many clients they are", () => {
    let admitted = 0;
    for (let n = 0; n < REPLAY_GLOBAL_LIMIT + 10; n++) {
      if (admitReplay(`10.2.${Math.floor(n / 200)}.${n % 200}`).allowed) admitted++;
    }
    expect(admitted).toBe(REPLAY_GLOBAL_LIMIT);
    expect(admitReplay("10.3.0.1").allowed).toBe(false);
  });

  // T-6262: the process-wide cap lives in the same limiter as the per-client buckets, whose map
  // evicts its oldest live keys past 10,000. Churning keys must not hand the cap back.
  it("keeps the global cap spent through a flood of unrelated limiter keys", () => {
    for (let n = 0; n < REPLAY_GLOBAL_LIMIT; n++) {
      expect(admitReplay(`10.6.${Math.floor(n / 200)}.${n % 200}`).allowed).toBe(true);
    }
    expect(admitReplay("10.7.0.1").allowed).toBe(false);

    for (let i = 0; i < 12_000; i++) {
      checkRateLimit(`churn-${i}`, { limit: 1, windowMs: REPLAY_WINDOW_MS });
    }

    expect(admitReplay("10.7.0.2").allowed).toBe(false);
    expect(admitReplay(undefined).allowed).toBe(false);
  });

  it("lets a client back in once its window has passed", () => {
    for (let n = 0; n < REPLAY_PER_CLIENT_LIMIT; n++) admitReplay("10.1.0.4");
    expect(admitReplay("10.1.0.4").allowed).toBe(false);
    vi.setSystemTime(Date.now() + REPLAY_WINDOW_MS + 1);
    expect(admitReplay("10.1.0.4").allowed).toBe(true);
  });

  it("does not spend the global budget on a client already over its own", () => {
    for (let n = 0; n < REPLAY_PER_CLIENT_LIMIT; n++) admitReplay("10.1.0.5");
    for (let n = 0; n < 50; n++) admitReplay("10.1.0.5");
    let admitted = 0;
    for (let n = 0; n < REPLAY_GLOBAL_LIMIT; n++) {
      if (admitReplay(`10.4.0.${n}`).allowed) admitted++;
    }
    expect(admitted).toBe(REPLAY_GLOBAL_LIMIT - REPLAY_PER_CLIENT_LIMIT);
  });

  it("is checked before the replay's turn: over the cap, the replay is not called", async () => {
    const spy = vi.fn(replayAsync);
    const denied = { allowed: false, retryAfterSeconds: 17 };
    const strict = createFailoverVerifier({ shadow: false, replay: spy, admit: () => denied });
    expect(await strict(input(retires, { client: "10.5.0.1" }))).toEqual({
      ok: false,
      reason: VERIFY_RATE_LIMITED_REASON,
      retryAfterSeconds: 17,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("is not spent on a refusal the gates or the memory already answer", async () => {
    const admit = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
    const spy = vi.fn(replayAsync);
    const strict = createFailoverVerifier({ shadow: false, replay: spy, admit });
    await strict(claim("", { ticks: DAILY_MAX_TICKS, score: 9_000 }));
    expect(admit).not.toHaveBeenCalled();
    // A refused claim is remembered, and asking again is not a new replay.
    const wrong = input(retires, { client: "10.5.0.2", score: retires.score + 5_000 });
    await strict(wrong);
    await strict(wrong);
    expect(admit).toHaveBeenCalledTimes(1);
  });

  it("is passed the caller's address, and a verifier that was given none still has the global cap", async () => {
    const admit = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
    const strict = createFailoverVerifier({ shadow: false, admit });
    await strict(input(retires, { client: "10.5.0.3" }));
    expect(admit).toHaveBeenCalledWith("10.5.0.3");
    clearReplayCache();
    await strict(input(retires));
    expect(admit).toHaveBeenLastCalledWith(undefined);
  });

  it("answers busy, not rate limited, when the queue is what is full", async () => {
    const started: Array<(result: ReplayResult) => void> = [];
    const held = vi.fn(
      () => new Promise<ReplayResult>((resolve) => started.push(resolve)),
    ) as unknown as typeof replayAsync;
    const verify = createFailoverVerifier({ shadow: false, replay: held });
    // One replay runs and MAX_WAITING wait; the next caller is turned away at the door.
    const calls = Array.from({ length: MAX_WAITING + 2 }, () => verify(input(retires)));
    await new Promise((resolve) => setImmediate(resolve));
    expect(await calls[MAX_WAITING + 1]).toEqual({ ok: false, reason: VERIFY_BUSY_REASON });
    expect(VERIFY_BUSY_REASON).not.toBe(VERIFY_RATE_LIMITED_REASON);
    expect(held).toHaveBeenCalledTimes(1);
    // Let the rest finish so nothing is left waiting.
    const result: ReplayResult = {
      endedAtTick: retires.ticks,
      endReason: "retired",
      seconds: retires.seconds,
      score: retires.score,
      hash: 0,
    };
    for (let i = 0; i <= MAX_WAITING; i++) {
      await new Promise((resolve) => setImmediate(resolve));
      started[i]?.(result);
    }
    expect(await Promise.all(calls.slice(0, MAX_WAITING + 1))).toEqual([
      { ok: true },
      { ok: true },
      { ok: true },
    ]);
  });
});
