// @vitest-environment node
import { describe, expect, it } from "vitest";
import { dailyFloor } from "@/components/game/script-knight/daily";
import { encodeLog } from "@/components/game/script-knight/engine/codec";
import { playWithBot } from "@/components/game/script-knight/engine/reference-bot";
import {
  ARCADE_GAME_SLUGS,
  ARCADE_GAMES,
  LEGACY_ARCADE_GAME_SLUGS,
  validateArcadeSubmission,
} from "../games";

const NOW = new Date("2026-10-15T12:00:00Z");
const DAY = 20261015;

/** The reference bot's winning log for a day, with the score and turns the server must find. */
function botRun(day: string) {
  const floor = dailyFloor(day);
  const { actions, result } = playWithBot(floor.config);
  return {
    log: encodeLog(actions),
    score: result.score?.total ?? -1,
    turns: result.turns,
  };
}

const today = botRun("2026-10-15");
const verify = ARCADE_GAMES["script-knight"].verify;

function detail(over: Partial<Record<string, unknown>> = {}) {
  return { day: DAY, turns: today.turns, hand: 0, ...over };
}

function verdict(
  over: {
    score?: number;
    detail?: Record<string, number>;
    proof?: string | null;
    now?: Date;
    deadline?: number;
  } = {},
) {
  return verify({
    score: today.score,
    detail: detail() as Record<string, number>,
    proof: today.log,
    now: NOW,
    deadline: Date.now() + 2_000,
    ...over,
  });
}

describe("script-knight in the arcade registry", () => {
  it("is an arcade slug, and not a legacy one", () => {
    expect([...ARCADE_GAME_SLUGS]).toContain("script-knight");
    expect([...LEGACY_ARCADE_GAME_SLUGS]).not.toContain("script-knight");
  });

  it("requires a proof and has a verifier", () => {
    expect(ARCADE_GAMES["script-knight"].requiresProof).toBe(true);
    expect(typeof verify).toBe("function");
  });

  it("pins the bot's run for 2026-10-15, so the cases below mean what they say", () => {
    expect(today).toEqual({ log: "1:h0h0h0h0h0w0w0w0s0h0h0h0h0w0w0w0w0", score: 118, turns: 17 });
  });
});

describe("script-knight detail (the synchronous check)", () => {
  const check = (d: unknown, now: Date = NOW) =>
    validateArcadeSubmission("script-knight", today.score, d, now);

  it("accepts numbers only, and stores exactly them", () => {
    expect(check(detail())).toEqual({ ok: true, detail: detail() });
    expect(check(detail({ hand: 1 })).ok).toBe(true);
  });

  it("rejects any day but today's UTC day, following the supplied clock", () => {
    for (const day of [20261014, 20261016]) {
      expect(check(detail({ day }))).toEqual({
        ok: false,
        kind: "implausible",
        reason: "not today's floor",
      });
    }
    expect(check(detail(), new Date("2026-10-15T23:59:59Z")).ok).toBe(true);
    expect(check(detail(), new Date("2026-10-16T00:00:00Z"))).toEqual({
      ok: false,
      kind: "implausible",
      reason: "not today's floor",
    });
  });

  it("answers a malformed detail with kind detail (400)", () => {
    const missing: Record<string, unknown> = detail();
    delete missing.turns;
    for (const bad of [
      {},
      missing,
      detail({ hand: 2 }),
      detail({ hand: "1" }),
      detail({ turns: 0 }),
      detail({ turns: 201 }),
      detail({ turns: 1.5 }),
      detail({ extra: 1 }),
      detail({ log: "1:w0" }),
      null,
    ]) {
      expect(check(bad)).toEqual({ ok: false, kind: "detail", reason: "invalid detail" });
    }
  });
});

describe("script-knight verifier (re-simulation)", () => {
  it("accepts the bot's winning log with its exact score", async () => {
    expect(await verdict()).toEqual({ ok: true });
    expect(await verdict({ detail: detail({ hand: 1 }) as Record<string, number> })).toEqual({
      ok: true,
    });
  });

  it("rejects a score one off, either way", async () => {
    for (const score of [today.score - 1, today.score + 1]) {
      expect(await verdict({ score })).toEqual({
        ok: false,
        reason: "score does not match the replay",
      });
    }
  });

  it("rejects a turn count that is not the replay's", async () => {
    expect(
      await verdict({ detail: detail({ turns: today.turns + 1 }) as Record<string, number> }),
    ).toEqual({ ok: false, reason: "turns do not match the replay" });
  });

  it("rejects a log that does not reach the stairs, and an empty one", async () => {
    for (const proof of ["1:w0w0", "1:"]) {
      expect(await verdict({ proof })).toEqual({
        ok: false,
        reason: "the run does not reach the stairs",
      });
    }
  });

  it("rejects actions after the stairs", async () => {
    expect(await verdict({ proof: `${today.log}w0` })).toEqual({
      ok: false,
      reason: "log longer than the run",
    });
  });

  it("rejects a malformed log or an unknown token", async () => {
    for (const proof of ["garbage", "", "2:w0", "1:z0", "1:w9", "1:w", `1:${"w0".repeat(201)}`]) {
      expect(await verdict({ proof }), proof).toEqual({ ok: false, reason: "unreadable log" });
    }
  });

  it("rejects an ability the floor does not grant, without throwing", async () => {
    // Bind and detonate are not in the Narrow Path's epic set.
    for (const token of ["b0", "d0"]) {
      expect(await verdict({ proof: `1:${token}` })).toEqual({
        ok: false,
        reason: "an action the floor does not grant",
      });
    }
  });

  it("rejects another day's log, and a day that is not today", async () => {
    const other = botRun("2026-10-16");
    expect(other.log).not.toBe(today.log);
    const result = await verdict({ proof: other.log, score: other.score });
    expect(result.ok).toBe(false);

    expect(await verdict({ detail: detail({ day: 20261016 }) as Record<string, number> })).toEqual({
      ok: false,
      reason: "not today's floor",
    });
    expect(await verdict({ now: new Date("2026-10-16T00:00:00Z") })).toEqual({
      ok: false,
      reason: "not today's floor",
    });
    expect((await verdict({ now: new Date("2026-10-15T23:59:59Z") })).ok).toBe(true);
  });

  it("rejects a missing proof", async () => {
    expect(await verdict({ proof: null })).toEqual({ ok: false, reason: "proof required" });
  });

  it("gives up when the deadline has passed", async () => {
    expect(await verdict({ deadline: Date.now() - 1 })).toEqual({
      ok: false,
      reason: "ran out of time",
    });
  });

  it("answers a full 200-turn log quickly", async () => {
    const proof = encodeLog(Array.from({ length: 200 }, () => ({ name: "rest", direction: null })));
    const started = performance.now();
    const result = await verdict({ proof });
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(result.ok).toBe(false);
  });
});
