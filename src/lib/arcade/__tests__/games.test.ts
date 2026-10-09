import { describe, it, expect } from "vitest";
import { dailyText } from "@/components/game/typing-speed/engine/daily";
import {
  ARCADE_GAME_SLUGS,
  ARCADE_GAMES,
  ARCADE_SCORE_CAP,
  LEGACY_ARCADE_GAME_SLUGS,
  validateArcadeSubmission,
} from "../games";

function spaceShooter(score: number, seconds: number, kills: number, distance: number) {
  return validateArcadeSubmission("space-shooter", score, { seconds, kills, distance });
}

function hextris(score: number, seconds: number, kills: number, level: number) {
  return validateArcadeSubmission("hextris", score, { seconds, kills, level });
}

function reasonOf(verdict: ReturnType<typeof spaceShooter>): string | null {
  return verdict.ok ? null : verdict.reason;
}

describe("registry", () => {
  it("registers exactly the arcade game slugs", () => {
    expect(Object.keys(ARCADE_GAMES).sort()).toEqual([...ARCADE_GAME_SLUGS].sort());
    expect([...ARCADE_GAME_SLUGS]).toEqual([
      "space-shooter",
      "hextris",
      "super-voltorb-flip",
      "tower-stacker",
      "typing-speed",
      "script-knight",
      "failover",
    ]);
  });

  it("keeps the legacy 10,000,000 score ceiling", () => {
    expect(ARCADE_SCORE_CAP).toBe(10_000_000);
  });
});

describe("detail schemas", () => {
  const spaceShooterSchema = ARCADE_GAMES["space-shooter"].detailSchema;
  const hextrisSchema = ARCADE_GAMES.hextris.detailSchema;

  it("space-shooter: accepts the legacy limits and rejects anything past them", () => {
    expect(
      spaceShooterSchema.safeParse({ seconds: 86_399, kills: 99_999, distance: 999_999 }).success,
    ).toBe(true);
    expect(spaceShooterSchema.safeParse({ seconds: 86_400, kills: 0, distance: 0 }).success).toBe(
      false,
    );
    expect(spaceShooterSchema.safeParse({ seconds: 0, kills: 100_000, distance: 0 }).success).toBe(
      false,
    );
    expect(
      spaceShooterSchema.safeParse({ seconds: 0, kills: 0, distance: 1_000_000 }).success,
    ).toBe(false);
  });

  it("space-shooter: rejects negatives, floats, missing fields and unknown keys (region is not accepted)", () => {
    expect(spaceShooterSchema.safeParse({ seconds: -1, kills: 0, distance: 0 }).success).toBe(
      false,
    );
    expect(spaceShooterSchema.safeParse({ seconds: 1.5, kills: 0, distance: 0 }).success).toBe(
      false,
    );
    expect(spaceShooterSchema.safeParse({ seconds: 1, kills: 0 }).success).toBe(false);
    expect(
      spaceShooterSchema.safeParse({ seconds: 1, kills: 0, distance: 0, region: "Canada" }).success,
    ).toBe(false);
  });

  it("hextris: strict seconds, kills and level; level is bounded loosely here and exactly in check()", () => {
    expect(hextrisSchema.safeParse({ seconds: 0, kills: 0, level: 1 }).success).toBe(true);
    expect(hextrisSchema.safeParse({ seconds: 0, kills: 0, level: 1000 }).success).toBe(true);
    expect(hextrisSchema.safeParse({ seconds: 0, kills: 0, level: 1001 }).success).toBe(false);
    expect(hextrisSchema.safeParse({ seconds: 0, kills: 0, level: 1.5 }).success).toBe(false);
    expect(hextrisSchema.safeParse({ seconds: 0, kills: 0, level: 1, distance: 3 }).success).toBe(
      false,
    );
  });
});

describe("validateArcadeSubmission: detail handling", () => {
  it("a malformed detail is kind 'detail', not 'implausible'", () => {
    expect(validateArcadeSubmission("space-shooter", 10, { seconds: 1 })).toEqual({
      ok: false,
      kind: "detail",
      reason: "invalid detail",
    });
    expect(validateArcadeSubmission("hextris", 10, null)).toEqual({
      ok: false,
      kind: "detail",
      reason: "invalid detail",
    });
  });

  it("returns the parsed detail on success", () => {
    expect(spaceShooter(100, 60, 40, 1500)).toEqual({
      ok: true,
      detail: { seconds: 60, kills: 40, distance: 1500 },
    });
    expect(hextris(0, 0, 0, 1)).toEqual({ ok: true, detail: { seconds: 0, kills: 0, level: 1 } });
  });
});

describe("space-shooter plausibility (audit 1.4, s = seconds + 2)", () => {
  it("kills <= 6s + 20: 60 s allows 392, rejects 393", () => {
    expect(spaceShooter(0, 60, 392, 0).ok).toBe(true);
    const over = spaceShooter(0, 60, 393, 0);
    expect(over).toMatchObject({ ok: false, kind: "implausible" });
    expect(reasonOf(over)).toBe("too many kills for the run length");
  });

  it("distance <= 2000 + 132s: 60 s allows 10184, rejects 10185", () => {
    expect(spaceShooter(0, 60, 0, 10_184).ok).toBe(true);
    const over = spaceShooter(0, 60, 0, 10_185);
    expect(over).toMatchObject({ ok: false, kind: "implausible" });
    expect(reasonOf(over)).toBe("distance too long for the run length");
  });

  it("score <= ceil(2 * rawMax): the audit's s=62, K=100, D=1500 example caps at 83056", () => {
    expect(spaceShooter(83_056, 60, 100, 1500).ok).toBe(true);
    const over = spaceShooter(83_057, 60, 100, 1500);
    expect(over).toMatchObject({ ok: false, kind: "implausible" });
    expect(reasonOf(over)).toBe("score too high for the run");
  });

  it("the boss term steps up at every 1500 distance: D=1499 caps at 75056, D=1500 at 83056", () => {
    expect(spaceShooter(75_056, 60, 100, 1499).ok).toBe(true);
    expect(spaceShooter(75_057, 60, 100, 1499).ok).toBe(false);
  });

  it("a short fabricated run is rejected: 10 s, no kills, no distance caps at 13729", () => {
    expect(spaceShooter(13_729, 10, 0, 0).ok).toBe(true);
    expect(spaceShooter(13_730, 10, 0, 0).ok).toBe(false);
    expect(spaceShooter(1_000_000, 10, 0, 0).ok).toBe(false);
  });

  it("an honest few-thousand-point 60 s run passes with a wide margin", () => {
    expect(spaceShooter(4_200, 60, 55, 1_400).ok).toBe(true);
  });
});

describe("hextris plausibility (audit 2.4, P' = kills + 80)", () => {
  it("1 <= level <= 35 (checked in check(), so a bad level is implausible, not a malformed body)", () => {
    expect(hextris(0, 0, 0, 0)).toMatchObject({
      ok: false,
      kind: "implausible",
      reason: "level out of range",
    });
    expect(hextris(0, 0, 0, 36)).toMatchObject({
      ok: false,
      kind: "implausible",
      reason: "level out of range",
    });
    expect(hextris(0, 0, 0, 1).ok).toBe(true);
    expect(hextris(0, 5000, 3000, 35).ok).toBe(true);
  });

  it("level >= min(35, floor(1 + 0.05525 * kills)) - 1: 100 kills needs level 5", () => {
    expect(hextris(0, 5, 100, 5).ok).toBe(true);
    expect(hextris(0, 5, 100, 4)).toMatchObject({
      ok: false,
      kind: "implausible",
      reason: "level too low for the pieces cleared",
    });
  });

  it("the level floor saturates at 34: 3000 kills accepts 34 and 35, rejects 33", () => {
    expect(hextris(0, 5000, 3000, 34).ok).toBe(true);
    expect(hextris(0, 5000, 3000, 33).ok).toBe(false);
  });

  it("seconds >= ceil((kills - 10) / 22.4) when kills > 10: 100 kills needs 5 s", () => {
    expect(hextris(0, 5, 100, 6).ok).toBe(true);
    expect(hextris(0, 4, 100, 6)).toMatchObject({
      ok: false,
      kind: "implausible",
      reason: "run too short for the pieces cleared",
    });
  });

  it("the seconds bound steps at 2070 and 2071 kills (92 s then 93 s)", () => {
    expect(hextris(0, 92, 2070, 34).ok).toBe(true);
    expect(hextris(0, 91, 2070, 34).ok).toBe(false);
    expect(hextris(0, 92, 2071, 34).ok).toBe(false);
    expect(hextris(0, 93, 2071, 34).ok).toBe(true);
  });

  it("no seconds requirement at 10 kills or fewer; 11 kills needs 1 s", () => {
    expect(hextris(0, 0, 10, 1).ok).toBe(true);
    expect(hextris(0, 0, 11, 1).ok).toBe(false);
    expect(hextris(0, 1, 11, 1).ok).toBe(true);
  });

  it("score <= 30P'^2 + 200P' + 5000: 100 kills caps at 1013000, 3 kills at 228270", () => {
    expect(hextris(1_013_000, 5, 100, 6).ok).toBe(true);
    const over = hextris(1_013_001, 5, 100, 6);
    expect(over).toMatchObject({ ok: false, kind: "implausible" });
    expect(reasonOf(over)).toBe("score too high for the pieces cleared");
    expect(hextris(228_270, 0, 3, 1).ok).toBe(true);
    expect(hextris(228_271, 0, 3, 1).ok).toBe(false);
  });

  it("kills >= 3 when score > 0: the smallest scoring match is three blocks", () => {
    expect(hextris(1, 0, 2, 1)).toMatchObject({
      ok: false,
      kind: "implausible",
      reason: "score without a scoring match",
    });
    expect(hextris(0, 0, 2, 1).ok).toBe(true);
    expect(hextris(9, 0, 3, 1).ok).toBe(true);
  });
});

describe("super-voltorb-flip (Daily board)", () => {
  // 2026-10-07: board 43, nine 2s, no 3s, ten Voltorbs, 15 safe tiles, max 512.
  const NOW = new Date("2026-10-07T12:00:00Z");
  const today = 20261007;
  const check = (score: number, detail: unknown, now: Date = NOW) =>
    validateArcadeSubmission("super-voltorb-flip", score, detail, now);

  it("is an arcade game", () => {
    expect(ARCADE_GAME_SLUGS).toContain("super-voltorb-flip");
  });

  it("accepts a cleared board, a partial bank and the smallest bank", () => {
    expect(check(512, { day: today, flips: 9 })).toEqual({
      ok: true,
      detail: { day: today, flips: 9 },
    });
    expect(check(64, { day: today, flips: 8 }).ok).toBe(true);
    expect(check(1, { day: today, flips: 1 }).ok).toBe(true);
  });

  it("rejects a score above the regenerated board's maximum (422)", () => {
    const verdict = check(513, { day: today, flips: 15 });
    expect(verdict).toEqual({
      ok: false,
      kind: "implausible",
      reason: "score above the board's maximum",
    });
  });

  it("rejects a score the board's tiles cannot multiply to", () => {
    expect(check(3, { day: today, flips: 3 })).toMatchObject({ ok: false, kind: "implausible" });
    expect(check(5, { day: today, flips: 3 })).toMatchObject({ ok: false, kind: "implausible" });
  });

  it("rejects too few flips and impossible flip counts", () => {
    expect(check(512, { day: today, flips: 8 })).toMatchObject({ ok: false, kind: "implausible" });
    expect(check(2, { day: today, flips: 0 })).toMatchObject({ ok: false, kind: "implausible" });
    expect(check(0, { day: today, flips: 16 })).toMatchObject({ ok: false, kind: "implausible" });
  });

  it("rejects any day but today's UTC day, either side of it", () => {
    for (const day of [20261006, 20261008, 20260101]) {
      expect(check(1, { day, flips: 1 })).toEqual({
        ok: false,
        kind: "implausible",
        reason: "not today's board",
      });
    }
  });

  it("follows the supplied clock across midnight UTC", () => {
    const justBefore = new Date("2026-10-07T23:59:59Z");
    const justAfter = new Date("2026-10-08T00:00:00Z");
    expect(check(1, { day: today, flips: 1 }, justBefore).ok).toBe(true);
    expect(check(1, { day: today, flips: 1 }, justAfter).ok).toBe(false);
    // 2026-10-08 is a different board (same id, different layout)
    expect(check(512, { day: 20261008, flips: 9 }, justAfter).ok).toBe(true);
  });

  it("answers a malformed detail with kind detail (400), not implausible", () => {
    const malformed = [
      {},
      { day: today },
      { flips: 1 },
      { day: today, flips: 26 },
      { day: "x", flips: 1 },
      { day: today, flips: 1, extra: 1 },
      null,
    ];
    for (const bad of malformed) {
      expect(check(1, bad)).toEqual({ ok: false, kind: "detail", reason: "invalid detail" });
    }
  });
});

describe("the legacy game list", () => {
  it("is exactly the two games that ever had a legacy leaderboard", () => {
    expect([...LEGACY_ARCADE_GAME_SLUGS]).toEqual(["space-shooter", "hextris"]);
  });
});

describe("tower-stacker (daily tower)", () => {
  const NOW = new Date("2026-10-15T12:00:00Z");
  const today = 20261015;
  const detail = (over: Partial<Record<string, unknown>> = {}) => ({
    day: today,
    blocks: 7,
    perfects: 5,
    streak: 5,
    seconds: 7,
    ...over,
  });
  const check = (score: number, d: unknown, now: Date = NOW) =>
    validateArcadeSubmission("tower-stacker", score, d, now);

  it("is an arcade game, and not a legacy one", () => {
    expect(ARCADE_GAME_SLUGS).toContain("tower-stacker");
    expect([...LEGACY_ARCADE_GAME_SLUGS]).toEqual(["space-shooter", "hextris"]);
  });

  it("accepts the scripted run and both ends of a score range", () => {
    expect(check(220, detail())).toEqual({ ok: true, detail: detail() });
    const twenty = detail({ blocks: 20, perfects: 6, streak: 3, seconds: 30 });
    expect(check(290, twenty).ok).toBe(true);
    expect(check(320, twenty).ok).toBe(true);
    expect(check(300, twenty).ok).toBe(true);
  });

  it("rejects a score outside the range, or not a multiple of 10", () => {
    const twenty = detail({ blocks: 20, perfects: 6, streak: 3, seconds: 30 });
    for (const score of [280, 330, 305]) {
      expect(check(score, twenty)).toEqual({
        ok: false,
        kind: "implausible",
        reason: "score does not match the landings",
      });
    }
  });

  it("caps a run at two hours and the floors that cadence allows", () => {
    // maxBlocksFor(7200) = floor(7201 * 1000 / 400) + 2 = 18004: one floor per 400 ms plus slack.
    const cap = detail({ blocks: 18_004, perfects: 0, streak: 0, seconds: 7_200 });
    expect(check(180_040, cap).ok).toBe(true);
    const invalid = { ok: false, kind: "detail", reason: "invalid detail" };
    expect(check(180_040, { ...cap, seconds: 7_201 })).toEqual(invalid);
    expect(check(180_050, { ...cap, blocks: 18_005 })).toEqual(invalid);
    expect(
      check(0, detail({ perfects: 18_005, streak: 0, blocks: 18_004, seconds: 7_200 })),
    ).toEqual(invalid);
  });

  it("rejects counts that contradict each other", () => {
    for (const d of [
      detail({ perfects: 8 }), // more perfects than floors
      detail({ streak: 6 }), // streak longer than the perfects
      detail({ perfects: 2, streak: 0 }),
    ]) {
      expect(check(220, d)).toEqual({
        ok: false,
        kind: "implausible",
        reason: "counts do not add up",
      });
    }
    expect(check(30, detail({ blocks: 3, perfects: 0, streak: 0 })).ok).toBe(true);
  });

  it("caps floors by the run length (one per 400 ms, plus slack)", () => {
    const at = (blocks: number) => detail({ blocks, perfects: 0, streak: 0, seconds: 10 });
    expect(check(290, at(29)).ok).toBe(true);
    expect(check(300, at(30))).toEqual({
      ok: false,
      kind: "implausible",
      reason: "too many floors for the run length",
    });
  });

  it("rejects any day but today's UTC day, and follows the supplied clock", () => {
    for (const day of [20261014, 20261016]) {
      expect(check(220, detail({ day }))).toEqual({
        ok: false,
        kind: "implausible",
        reason: "not today's tower",
      });
    }
    expect(check(220, detail(), new Date("2026-10-15T23:59:59Z")).ok).toBe(true);
    expect(check(220, detail(), new Date("2026-10-16T00:00:00Z")).ok).toBe(false);
  });

  it("answers a malformed detail with kind detail (400)", () => {
    const missingSeconds: Record<string, unknown> = detail();
    delete missingSeconds.seconds;
    for (const bad of [
      {},
      missingSeconds,
      detail({ extra: 1 }),
      detail({ blocks: 1.5 }),
      detail({ blocks: -1 }),
      detail({ day: "x" }),
      null,
    ]) {
      expect(check(220, bad)).toEqual({ ok: false, kind: "detail", reason: "invalid detail" });
    }
  });
});

describe("typing-speed daily", () => {
  const NOW = new Date("2026-10-08T12:00:00Z");
  const L = dailyText("2026-10-08").text.length;
  const detail = (over: Record<string, unknown> = {}) => ({
    day: 20261008,
    ms: L * 200,
    chars: L,
    acc: 97,
    ...over,
  });
  const check = (score: number, d: unknown, now: Date = NOW) =>
    validateArcadeSubmission("typing-speed", score, d, now);

  it("accepts an honest run and the exact 300 WPM ceiling", () => {
    expect(check(60, detail()).ok).toBe(true);
    expect(check(300, detail({ ms: L * 40 })).ok).toBe(true);
  });

  it("rejects a run shorter than the text allows", () => {
    expect(check(300, detail({ ms: L * 40 - 1 }))).toEqual({
      ok: false,
      kind: "implausible",
      reason: "run shorter than the text allows",
    });
  });

  it("rejects more characters than the text has", () => {
    expect(check(61, detail({ ms: 60_000, chars: L + 5 }))).toEqual({
      ok: false,
      kind: "implausible",
      reason: "more characters than the text has",
    });
  });

  it("rejects a score that does not match the characters and time", () => {
    for (const score of [59, 61]) {
      expect(check(score, detail())).toEqual({
        ok: false,
        kind: "implausible",
        reason: "score does not match the run",
      });
    }
  });

  it("rejects any day but today's UTC day, and follows the supplied clock", () => {
    for (const day of [20261007, 20261009]) {
      expect(check(60, detail({ day }))).toEqual({
        ok: false,
        kind: "implausible",
        reason: "not today's text",
      });
    }
    expect(check(60, detail(), new Date("2026-10-08T23:59:59Z")).ok).toBe(true);
    expect(check(60, detail(), new Date("2026-10-09T00:00:00Z")).ok).toBe(false);
  });

  it("answers a malformed detail with kind detail (400)", () => {
    const missingMs: Record<string, unknown> = detail();
    delete missingMs.ms;
    for (const bad of [
      {},
      missingMs,
      detail({ extra: 1 }),
      detail({ ms: 1.5 }),
      detail({ ms: 0 }),
      detail({ chars: 0 }),
      detail({ acc: 101 }),
      detail({ day: "x" }),
      null,
    ]) {
      expect(check(60, bad)).toEqual({ ok: false, kind: "detail", reason: "invalid detail" });
    }
  });
});
