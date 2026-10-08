import { z } from "zod";
import type { GameSlug } from "@/app/games/games-meta";
import {
  checkDailyScore,
  dailyBoard,
  dayNumber,
} from "@/components/game/super-voltorb-flip/daily-board";
import { dayNumber as towerDayNumber } from "@/components/game/tower-stacker/daily";
import { maxBlocksFor } from "@/components/game/tower-stacker/engine";
import { LAND_POINTS, scoreRange } from "@/components/game/tower-stacker/scoring";
import { utcDayKey } from "./boards";

/**
 * The arcade plausibility registry. Games are fully client side, so every submitted
 * value is client supplied: these checks are CEILINGS derived from each game's own
 * scoring rules (audit/t1b-scoring.md sections 1.4 and 2.4), not proof of an honest
 * run, and not anti-cheat (DESIGN.md register). They reject fabricated short runs and
 * absurd claims; they do not catch moderate inflation on a long run.
 *
 * Adding a game to the arcade = a validator here + tests pinned to worked examples
 * (one accept and one reject per inequality) + a hook swap in the game.
 */

/** Hand-authored and `satisfies`-checked against the canonical slug union. */
export const ARCADE_GAME_SLUGS = [
  "space-shooter",
  "hextris",
  "super-voltorb-flip",
  "tower-stacker",
] as const satisfies readonly GameSlug[];

export type ArcadeGameSlug = (typeof ARCADE_GAME_SLUGS)[number];

/**
 * The games that had rows in the frozen legacy leaderboard_entries table. The
 * one-time legacy import and the legacy row schema use THIS list, not the full
 * registry: a game added to the arcade later never had legacy rows.
 */
export const LEGACY_ARCADE_GAME_SLUGS = [
  "space-shooter",
  "hextris",
] as const satisfies readonly ArcadeGameSlug[];

export type LegacyArcadeGameSlug = (typeof LEGACY_ARCADE_GAME_SLUGS)[number];

/** The legacy score ceiling (src/app/api/leaderboard/route.ts SCORE_CAP). */
export const ARCADE_SCORE_CAP = 10_000_000;

type Verdict = { ok: true } | { ok: false; reason: string };

function reject(reason: string): Verdict {
  return { ok: false, reason };
}

// Detail limits are the legacy route's: seconds < 86400, kills < 100000, distance < 1000000.
const spaceShooterDetailSchema = z.strictObject({
  seconds: z.number().int().min(0).max(86_399),
  kills: z.number().int().min(0).max(99_999),
  distance: z.number().int().min(0).max(999_999),
});

// level is bounded loosely here (the legacy route accepted 1..1000) and exactly in
// checkHextris, so an out-of-range level is a 422 "implausible", not a malformed body.
const hextrisDetailSchema = z.strictObject({
  seconds: z.number().int().min(0).max(86_399),
  kills: z.number().int().min(0).max(99_999),
  level: z.number().int().min(0).max(1_000),
});

// Super Voltorb Flip's Daily board: the UTC day it was played (YYYYMMDD) and how
// many safe tiles were flipped. The bounds here are loose; checkVoltorbDaily
// regenerates the day's board and decides.
const voltorbDailyDetailSchema = z.strictObject({
  day: z.number().int().min(20_000_101).max(99_991_231),
  flips: z.number().int().min(0).max(25),
});

// Tower Stacker's daily tower: the UTC day (YYYYMMDD), floors landed, perfects, the
// longest perfect streak and whole seconds of active play. checkTowerStacker decides.
const towerDetailSchema = z.strictObject({
  day: z.number().int().min(20_000_101).max(99_991_231),
  blocks: z.number().int().min(0).max(99_999),
  perfects: z.number().int().min(0).max(99_999),
  streak: z.number().int().min(0).max(99_999),
  seconds: z.number().int().min(0).max(86_399),
});

type SpaceShooterDetail = z.infer<typeof spaceShooterDetailSchema>;
type HextrisDetail = z.infer<typeof hextrisDetailSchema>;
type VoltorbDailyDetail = z.infer<typeof voltorbDailyDetailSchema>;
type TowerDetail = z.infer<typeof towerDetailSchema>;

/**
 * Orbital Dodge. s = seconds + 2 (floor, a stale UI sync, slack). Every term uses its
 * per-event maximum and the maximum Score Boost (x2.0), so honest play cannot exceed it
 * unless the scoring rules change; if they do, revisit this formula and its pins.
 * Region is not accepted in v2 (spoofable and unverifiable).
 */
function checkSpaceShooter(score: number, detail: SpaceShooterDetail): Verdict {
  const s = detail.seconds + 2;
  if (detail.kills > 6 * s + 20) return reject("too many kills for the run length");
  if (detail.distance > 2000 + 132 * s) return reject("distance too long for the run length");
  const rawMax =
    8 * s + // time alive
    220 * detail.kills + // kills at 10x combo, heaviest asteroid
    19 * (7 * s + 40) + // dodged obstacles including walls, +4 plus near-miss +15
    25 * (s / 11 + 1) + // power-ups
    30 * s + // swarm-mother drones
    4000 * (1 + Math.floor(detail.distance / 1500)); // tier-8 bonus for every boss
  if (score > Math.ceil(2 * rawMax)) return reject("score too high for the run");
  return { ok: true };
}

/**
 * Hextris. P' = kills + 80 (blocks scored but not yet counted can be in flight at game
 * over). The envelope is deliberately far above realistic play because combo is unbounded;
 * it mainly rejects small-kills claims of huge scores.
 */
function checkHextris(score: number, detail: HextrisDetail): Verdict {
  if (detail.level < 1 || detail.level > 35) return reject("level out of range");
  const minLevel = Math.min(35, Math.floor(1 + 0.05525 * detail.kills)) - 1;
  if (detail.level < minLevel) return reject("level too low for the pieces cleared");
  if (detail.kills > 10 && detail.seconds < Math.ceil((detail.kills - 10) / 22.4)) {
    return reject("run too short for the pieces cleared");
  }
  const p = detail.kills + 80;
  if (score > 30 * p * p + 200 * p + 5000) return reject("score too high for the pieces cleared");
  if (score > 0 && detail.kills < 3) return reject("score without a scoring match");
  return { ok: true };
}

/**
 * Super Voltorb Flip, Daily board. The server regenerates today's board from the
 * UTC date (the same seeded recipe the game uses) and bounds the score by what
 * that board can pay: at most its maximum, a product of its 2s and 3s, reached
 * with enough flips. The claimed day must be today's UTC day by the server's own
 * clock; there is no grace window across midnight (DESIGN.md).
 */
function checkVoltorbDaily(score: number, detail: VoltorbDailyDetail, now: Date): Verdict {
  const today = utcDayKey(now);
  if (detail.day !== dayNumber(today)) return reject("not today's board");
  const reason = checkDailyScore(dailyBoard(today), score, detail.flips);
  return reason === null ? { ok: true } : reject(reason);
}

/**
 * Tower Stacker, daily tower. The day must be today's UTC day by the server clock (no
 * grace across midnight, the Voltorb rule); the counts must agree; the engine spawns at
 * most one block per CYCLE_MS of active play; and the score must lie in the range the
 * landings allow. Ceilings on client numbers, not proof of an honest run.
 */
function checkTowerStacker(score: number, detail: TowerDetail, now: Date): Verdict {
  if (detail.day !== towerDayNumber(utcDayKey(now))) return reject("not today's tower");
  const range = scoreRange(detail.blocks, detail.perfects, detail.streak);
  if (range === null) return reject("counts do not add up");
  if (detail.blocks > maxBlocksFor(detail.seconds)) {
    return reject("too many floors for the run length");
  }
  if (score % LAND_POINTS !== 0 || score < range.min || score > range.max) {
    return reject("score does not match the landings");
  }
  return { ok: true };
}

/** Slug to strict detail schema; `validateArcadeSubmission` dispatches to the game's check. */
export const ARCADE_GAMES = {
  "space-shooter": { detailSchema: spaceShooterDetailSchema },
  hextris: { detailSchema: hextrisDetailSchema },
  "super-voltorb-flip": { detailSchema: voltorbDailyDetailSchema },
  "tower-stacker": { detailSchema: towerDetailSchema },
} satisfies Record<ArcadeGameSlug, { detailSchema: z.ZodType }>;

export type ArcadeSubmissionVerdict =
  | { ok: true; detail: Record<string, number> }
  | { ok: false; kind: "detail" | "implausible"; reason: string };

function verdictFor<T extends Record<string, number>>(
  parsed: { success: true; data: T } | { success: false },
  check: (detail: T) => Verdict,
): ArcadeSubmissionVerdict {
  if (!parsed.success) return { ok: false, kind: "detail", reason: "invalid detail" };
  const verdict = check(parsed.data);
  if (!verdict.ok) return { ok: false, kind: "implausible", reason: verdict.reason };
  return { ok: true, detail: parsed.data };
}

/**
 * Parse `rawDetail` with the game's strict schema, then run its plausibility check.
 * `kind: "detail"` is a malformed body (HTTP 400); `kind: "implausible"` is HTTP 422.
 * The common score range (integer 0..ARCADE_SCORE_CAP) is the route's body schema's job.
 * `now` is the server clock the route also uses for the board key, so a clock-dependent
 * check (the Voltorb Daily day) and the board a score lands on agree on the instant.
 */
export function validateArcadeSubmission(
  game: ArcadeGameSlug,
  score: number,
  rawDetail: unknown,
  now: Date = new Date(),
): ArcadeSubmissionVerdict {
  switch (game) {
    case "space-shooter":
      return verdictFor(ARCADE_GAMES["space-shooter"].detailSchema.safeParse(rawDetail), (detail) =>
        checkSpaceShooter(score, detail),
      );
    case "hextris":
      return verdictFor(ARCADE_GAMES.hextris.detailSchema.safeParse(rawDetail), (detail) =>
        checkHextris(score, detail),
      );
    case "super-voltorb-flip":
      return verdictFor(
        ARCADE_GAMES["super-voltorb-flip"].detailSchema.safeParse(rawDetail),
        (detail) => checkVoltorbDaily(score, detail, now),
      );
    case "tower-stacker":
      return verdictFor(ARCADE_GAMES["tower-stacker"].detailSchema.safeParse(rawDetail), (detail) =>
        checkTowerStacker(score, detail, now),
      );
  }
}
