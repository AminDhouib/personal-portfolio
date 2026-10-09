// The daily floor: one generated corridor per UTC day, the same for everyone. PURE and DOM-free:
// the server's arcade check imports it (daily.test.ts runs in node). The day key comes from
// utcDayKey (src/lib/arcade/boards.ts), so the floor and the board turn over together.
import { fnv1a, mulberry32, rangeInt, subSeed, type Rng } from "../password-game-2/engine/rng";
import type { LevelConfig, UnitConfig } from "./engine/core/level-config";
import { playWithBot } from "./engine/reference-bot";
import { configForRef } from "./engine/run";
import { EAST, WEST } from "./engine/spatial";
import { Archer, Captive, Sludge, ThickSludge, Wizard } from "./engine/units";

/** Bump the version if the generator ever changes; an old day's floor must not shift. */
export const DAILY_RECIPE = "knight-daily-v1";

/** The warrior's name inside the engine; the sandbox worker and the stage use the same one. */
const WARRIOR_NAME = "Knight";
const MAX_ATTEMPTS = 64;
const MIN_ENEMIES = 2;
const MIN_PAR_TURNS = 8;

export interface DailyFloor {
  day: string;
  config: LevelConfig;
  /** The reference bot's score on this floor. */
  par: number;
  source: "generated" | "fallback";
  /** The attempt that produced it, or MAX_ATTEMPTS for the fallback. */
  attempt: number;
}

/** "2026-10-15" -> 20261015. */
export function dayNumber(day: string): number {
  return Number(day.replace(/-/g, ""));
}

const ENEMIES = [Sludge, ThickSludge, Archer, Wizard] as const;

function epicBase(level: number): LevelConfig {
  return configForRef({ kind: "tower", tower: "narrow-path", level, epic: true }, WARRIOR_NAME);
}

/** Picks `count` distinct values from the inclusive range, in ascending order. */
function pickSlots(rng: Rng, from: number, to: number, count: number): number[] {
  const pool: number[] = [];
  for (let x = from; x <= to; x += 1) pool.push(x);
  const picked: number[] = [];
  while (picked.length < count && pool.length > 0) {
    const [slot] = pool.splice(Math.floor(rng() * pool.length), 1);
    if (slot !== undefined) picked.push(slot);
  }
  return picked.sort((a, b) => a - b);
}

/**
 * One attempt at a corridor: width 7 to 12, the warrior facing east with the full epic ability
 * set, two to four enemies, sometimes a captive ahead, sometimes a captive behind the start.
 */
export function generateFloor(day: string, attempt: number): LevelConfig {
  const seed = subSeed(fnv1a(`${DAILY_RECIPE}-${day}`), `attempt-${attempt}`);
  const rng = mulberry32(seed);
  const width = rangeInt(rng, 7, 12);
  const captiveBehind = rng() < 0.25;
  const startX = captiveBehind ? 1 : 0;
  const enemyCount = rangeInt(rng, MIN_ENEMIES, 4);
  const captiveAhead = rng() < 0.5;

  const slots = pickSlots(rng, startX + 1, width - 2, enemyCount + (captiveAhead ? 1 : 0));
  const units: UnitConfig[] = [];
  if (captiveBehind) {
    units.push({ unit: Captive, position: { x: 0, y: 0, facing: EAST } });
  }
  const captiveSlot = captiveAhead ? slots[Math.floor(rng() * slots.length)] : undefined;
  for (const x of slots) {
    const unit =
      x === captiveSlot ? Captive : (ENEMIES[Math.floor(rng() * ENEMIES.length)] ?? Sludge);
    units.push({ unit, position: { x, y: 0, facing: WEST } });
  }

  const base = epicBase(9);
  return {
    ...base,
    number: 0,
    description: "A fresh corridor, the same for everyone today. Something is waiting in the dark.",
    tip: "You have every ability the tower teaches. Sense before you act, and watch your health.",
    clue: "",
    timeBonus: 20 + 6 * width,
    aceScore: 0,
    floor: {
      size: { width, height: 1 },
      stairs: { x: width - 1, y: 0 },
      warrior: {
        ...base.floor.warrior,
        position: { x: startX, y: 0, facing: EAST },
      },
      units,
    },
  };
}

function enemiesOf(config: LevelConfig): number {
  return (config.floor.units ?? []).filter((u) => u.unit !== Captive).length;
}

/** Plays the reference bot on a floor; null when it does not pass. */
function botPar(config: LevelConfig): { turns: number; par: number } | null {
  const { status, result } = playWithBot(config);
  if (status !== "passed" || !result.score) return null;
  return { turns: result.turns, par: result.score.total };
}

/** The built-in floor for a day: a Narrow Path floor, in epic configuration, by day number. */
export function fallbackFloor(day: string): DailyFloor {
  const level = (dayNumber(day) % 9) + 1;
  const config = epicBase(level);
  const bot = botPar(config);
  return { day, config, par: bot?.par ?? 0, source: "fallback", attempt: MAX_ATTEMPTS };
}

function build(day: string): DailyFloor {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const config = generateFloor(day, attempt);
    if (enemiesOf(config) < MIN_ENEMIES) continue;
    const bot = botPar(config);
    if (bot === null || bot.turns < MIN_PAR_TURNS) continue;
    return {
      day,
      config: { ...config, aceScore: bot.par },
      par: bot.par,
      source: "generated",
      attempt,
    };
  }
  return fallbackFloor(day);
}

let memo: DailyFloor | null = null;

/** The day's floor. Memoized for one day, so the server builds it once per UTC day. */
export function dailyFloor(day: string): DailyFloor {
  if (memo?.day !== day) memo = build(day);
  return memo;
}
