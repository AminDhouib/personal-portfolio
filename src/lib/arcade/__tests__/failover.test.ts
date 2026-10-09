// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ARCADE_GAME_SLUGS,
  ARCADE_VERIFY_BUDGET_MS,
  ARCADE_GAMES,
  LEGACY_ARCADE_GAME_SLUGS,
  validateArcadeSubmission,
} from "../games";
import { MAX_PLAUSIBLE_SCORE, verifyFailoverRun } from "../failover-verify";

const NOW = new Date("2026-10-15T12:00:00Z");
const DAY = 20261015;

function detail(over: Partial<Record<string, unknown>> = {}) {
  return { day: DAY, seconds: 61, ticks: 1220, actions: 14, ...over };
}

const check = (d: unknown, score = 1000, now: Date = NOW) =>
  validateArcadeSubmission("failover", score, d, now);

describe("failover in the arcade registry", () => {
  it("is an arcade slug, and not a legacy one", () => {
    expect([...ARCADE_GAME_SLUGS]).toContain("failover");
    expect([...LEGACY_ARCADE_GAME_SLUGS]).not.toContain("failover");
  });

  it("gets 8000 ms to verify, and every other game keeps the default", () => {
    // Worst case 605 ms on a fast desktop; 8000 covers a host about 4 times slower with 2 waiting.
    expect(ARCADE_GAMES.failover.verifyBudgetMs).toBe(8_000);
    for (const [slug, entry] of Object.entries(ARCADE_GAMES)) {
      if (slug !== "failover") expect("verifyBudgetMs" in entry).toBe(false);
    }
    expect(ARCADE_VERIFY_BUDGET_MS).toBe(2_000);
  });

  it("requires a proof and verifies it with the replay verifier", () => {
    expect(ARCADE_GAMES.failover.requiresProof).toBe(true);
    expect(ARCADE_GAMES.failover.verify).toBe(verifyFailoverRun);
  });
});

describe("failover detail", () => {
  it("accepts numbers only, and stores exactly them", () => {
    expect(check(detail())).toEqual({ ok: true, detail: detail() });
  });

  it("accepts the edges: a run of one tick, and the 900 s cap with 700 actions", () => {
    expect(check(detail({ seconds: 0, ticks: 1, actions: 0 })).ok).toBe(true);
    expect(check(detail({ seconds: 900, ticks: 18_000, actions: 700 })).ok).toBe(true);
  });

  it("answers a malformed detail with kind detail (400)", () => {
    const missing: Record<string, unknown> = detail();
    delete missing.actions;
    for (const bad of [
      {},
      missing,
      detail({ ticks: 0 }),
      detail({ ticks: 18_001 }),
      detail({ seconds: 901 }),
      detail({ seconds: -1 }),
      detail({ actions: 701 }),
      detail({ actions: -1 }),
      detail({ ticks: 1220.5 }),
      detail({ day: "20261015" }),
      detail({ day: 20_000_100 }),
      detail({ extra: 1 }),
      detail({ proof: "1,8" }),
      detail({ hand: 0 }),
      null,
    ]) {
      expect(check(bad)).toEqual({ ok: false, kind: "detail", reason: "invalid detail" });
    }
  });
});

describe("failover plausibility, the part that needs no replay", () => {
  it("rejects any day but today's UTC day, following the supplied clock", () => {
    for (const day of [20261014, 20261016]) {
      expect(check(detail({ day }))).toEqual({
        ok: false,
        kind: "implausible",
        reason: "not today's run",
      });
    }
    expect(check(detail(), 1000, new Date("2026-10-15T23:59:59Z")).ok).toBe(true);
    expect(check(detail(), 1000, new Date("2026-10-16T00:00:00Z"))).toMatchObject({
      reason: "not today's run",
    });
  });

  it("rejects seconds that are not the ticks over twenty", () => {
    expect(check(detail({ seconds: 62 }))).toEqual({
      ok: false,
      kind: "implausible",
      reason: "seconds do not match the ticks",
    });
    expect(check(detail({ seconds: 60, ticks: 1220 }))).toMatchObject({ ok: false });
    expect(check(detail({ seconds: 61, ticks: 1239 })).ok).toBe(true);
  });

  it("rejects a score no 900 s run can reach, and accepts the ceiling itself", () => {
    expect(MAX_PLAUSIBLE_SCORE).toBe(1_000_000);
    expect(check(detail(), MAX_PLAUSIBLE_SCORE).ok).toBe(true);
    expect(check(detail(), MAX_PLAUSIBLE_SCORE + 1)).toEqual({
      ok: false,
      kind: "implausible",
      reason: "score too high for the run",
    });
  });
});
