import { describe, it, expect } from "vitest";
import {
  ARCADE_GAME_SLUGS,
  ARCADE_GAMES,
  ARCADE_SCORE_CAP,
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
    expect([...ARCADE_GAME_SLUGS]).toEqual(["space-shooter", "hextris"]);
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
