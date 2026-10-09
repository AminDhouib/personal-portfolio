import type { TurnAction } from "./codec";
import { type Level, loadLevel, MAX_TURNS } from "./core/level";
import { getLevelConfig, type LevelConfig } from "./core/level-config";
import type { TurnEvent } from "./core/logger";
import { createFacade, type TurnFacade, type WarriorTurn } from "./facade";
import type { TowerLevelRef } from "./level-ref";
import { getLevelScore, type LevelScore } from "./scoring";
import { verifyRelativeDirection } from "./spatial";
import { TOWERS } from "./towers";

export type { WarriorTurn } from "./facade";

export interface TurnRecord {
  /** 1-based turn number. */
  t: number;
  action: TurnAction;
  /** Every event of the turn, the warrior's first, each with a full floor snapshot. */
  events: TurnEvent[];
}

export type RunStatus = "playing" | "passed" | "failed" | "out-of-turns";

export interface RunResult {
  passed: boolean;
  turns: number;
  score: (LevelScore & { total: number }) | null;
  /** total / aceScore, or null when the run did not pass (or the floor has no ace score). */
  grade: number | null;
  warrior: { health: number; score: number };
}

export interface Run {
  readonly config: LevelConfig;
  readonly status: RunStatus;
  readonly turnCount: number;
  readonly initial: TurnEvent;
  /** The warrior's turn facade for this turn; call its abilities, then endTurn. */
  beginTurn(): WarriorTurn;
  /** Every other unit chooses, then all units act, in upstream order. */
  endTurn(): TurnRecord;
  /** Step with a known action (replays, hand mode, the server). */
  step(action: TurnAction): TurnRecord;
  result(): RunResult;
}

/** Builds the level config for a tower floor; throws for a level the tower does not have. */
export function configForRef(ref: TowerLevelRef, warriorName: string): LevelConfig {
  const tower = TOWERS[ref.tower];
  if (!Number.isInteger(ref.level) || ref.level < 1 || ref.level > tower.levels.length) {
    throw new Error(`${ref.tower} has no level ${ref.level}`);
  }
  const config = getLevelConfig(tower, ref.level, warriorName, ref.epic);
  if (!config) {
    throw new Error(`${ref.tower} has no level ${ref.level}`);
  }
  return config;
}

class RunImpl implements Run {
  readonly config: LevelConfig;
  readonly initial: TurnEvent;
  private readonly level: Level;
  private current: TurnFacade | null = null;
  private currentStatus: RunStatus = "playing";
  private played = 0;

  constructor(config: LevelConfig) {
    this.config = config;
    this.level = loadLevel(config);
    this.initial = this.level.logger.initialState;
  }

  get status(): RunStatus {
    return this.currentStatus;
  }

  get turnCount(): number {
    return this.played;
  }

  beginTurn(): WarriorTurn {
    if (this.currentStatus !== "playing") {
      throw new Error("The run is over.");
    }
    if (this.current) {
      throw new Error("A turn has already begun: call endTurn first.");
    }
    const warrior = this.level.floor.warrior;
    if (!warrior) {
      throw new Error("The floor has no warrior.");
    }
    this.level.logger.turn();
    this.current = createFacade(warrior);
    return this.current.turn;
  }

  endTurn(): TurnRecord {
    const facade = this.current;
    if (!facade) {
      throw new Error("No turn in progress: call beginTurn first.");
    }
    this.current = null;
    facade.revoke();

    // Level.play's order: every unit chooses against the start-of-turn state (the warrior has
    // already chosen, through the facade), then every unit that was alive acts.
    const { floor } = this.level;
    const units = floor.getUnits();
    units.forEach((unit) => {
      if (unit !== floor.warrior) {
        unit.prepareTurn();
      }
    });
    floor.getUnits().forEach((unit) => unit.performTurn());

    this.played += 1;
    if (this.level.wasPassed()) {
      this.currentStatus = "passed";
    } else if (this.level.wasFailed()) {
      this.currentStatus = "failed";
    } else if (this.played >= MAX_TURNS) {
      this.currentStatus = "out-of-turns";
    }
    return {
      t: this.played,
      action: facade.action(),
      events: this.level.logger.lastTurn ?? [],
    };
  }

  step(action: TurnAction): TurnRecord {
    if (this.currentStatus !== "playing") {
      throw new Error("The run is over.");
    }
    // Check everything that could throw before the turn begins, so a refused action leaves the
    // run exactly as it was.
    if (action) {
      if (!this.level.floor.warrior?.abilities.has(action.name)) {
        throw new Error(`This floor does not give you ${action.name} yet.`);
      }
      if (action.direction !== null) {
        verifyRelativeDirection(action.direction);
      }
    }
    const turn = this.beginTurn();
    if (action) {
      const act = turn[action.name];
      if (action.direction === null) {
        act?.();
      } else {
        act?.(action.direction);
      }
    }
    return this.endTurn();
  }

  result(): RunResult {
    const warrior = this.level.floor.warrior;
    const passed = this.currentStatus === "passed";
    const score = getLevelScore({ passed, turns: this.level.logger.turns }, this.config);
    const total = score ? score.warrior + score.timeBonus + score.clearBonus : null;
    return {
      passed,
      turns: this.played,
      score: score && total !== null ? { ...score, total } : null,
      grade: total !== null && this.config.aceScore > 0 ? total / this.config.aceScore : null,
      warrior: warrior ? warrior.getStatus() : { health: 0, score: 0 },
    };
  }
}

export function createRun(config: LevelConfig): Run {
  return new RunImpl(config);
}

/**
 * Replays an action log from the start. Stops at the first terminal status and reports how many
 * actions it consumed (the server rejects a log with leftovers). Throws on an action the floor
 * does not grant.
 */
export function replayLog(
  config: LevelConfig,
  actions: readonly TurnAction[],
): { records: TurnRecord[]; result: RunResult; consumed: number } {
  const run = createRun(config);
  const records: TurnRecord[] = [];
  let consumed = 0;
  for (const action of actions) {
    if (run.status !== "playing") {
      break;
    }
    records.push(run.step(action));
    consumed += 1;
  }
  return { records, result: run.result(), consumed };
}
