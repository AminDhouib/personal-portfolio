// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/scoring/src/*.ts. Copyright (c) 2015-present Matias Olivera. MIT licence: see ./LICENSE.
// Modified by Amin Dhouib, 2026: merged; the grade helpers added to LevelScore.

export interface ScoringFloorSpace {
  unit?: unknown;
}

export interface ScoringEvent {
  warriorStatus?: { score: number };
  floorMap: ScoringFloorSpace[][];
}

export interface LevelScore {
  clearBonus: number;
  timeBonus: number;
  warrior: number;
}

/** Returns the last event of the play. */
export function getLastEvent<T extends ScoringEvent>(turns: T[][]): T {
  const lastTurnEvents = turns.at(-1);
  const last = lastTurnEvents?.at(-1);
  if (!last) {
    throw new Error("No turn events found.");
  }

  return last;
}

/** Returns the number of turns played. */
export function getTurnCount(turns: ScoringEvent[][]): number {
  return turns.length;
}

/** Returns the score of the warrior at the end of the play. */
export function getWarriorScore(turns: ScoringEvent[][]): number {
  const lastEvent = getLastEvent(turns);
  if (!lastEvent.warriorStatus) {
    throw new Error("Last event has no warrior status.");
  }

  return lastEvent.warriorStatus.score;
}

/** Returns the remaining time bonus: the initial bonus minus the turns played, floored at zero. */
export function getRemainingTimeBonus(turns: ScoringEvent[][], timeBonus: number): number {
  return Math.max(timeBonus - getTurnCount(turns), 0);
}

/** The floor is clear when there are no units other than the warrior. */
export function isFloorClear(floorMap: ScoringFloorSpace[][]): boolean {
  const spaces = floorMap.reduce<ScoringFloorSpace[]>((acc, val) => acc.concat(val), []);
  const unitCount = spaces.filter((space) => !!space.unit).length;
  return unitCount <= 1;
}

/** Returns the bonus for clearing the level. */
export function getClearBonus(
  turns: ScoringEvent[][],
  warriorScore: number,
  timeBonus: number,
): number {
  const lastEvent = getLastEvent(turns);
  if (!isFloorClear(lastEvent.floorMap)) {
    return 0;
  }

  return Math.round((warriorScore + timeBonus) * 0.2);
}

/** Returns the score of a level, broken down into its parts, or null when it was not passed. */
export function getLevelScore(
  { passed, turns }: { passed: boolean; turns: ScoringEvent[][] },
  { timeBonus }: { timeBonus: number },
): LevelScore | null {
  if (!passed) {
    return null;
  }

  const warriorScore = getWarriorScore(turns);
  const remainingTimeBonus = getRemainingTimeBonus(turns, timeBonus);
  const clearBonus = getClearBonus(turns, warriorScore, remainingTimeBonus);
  return {
    clearBonus,
    timeBonus: remainingTimeBonus,
    warrior: warriorScore,
  };
}

/** Returns the letter for the given grade. */
export function getGradeLetter(grade: number): string {
  if (grade >= 1.0) {
    return "S";
  }

  if (grade >= 0.9) {
    return "A";
  }

  if (grade >= 0.8) {
    return "B";
  }

  if (grade >= 0.7) {
    return "C";
  }

  if (grade >= 0.6) {
    return "D";
  }

  return "F";
}
