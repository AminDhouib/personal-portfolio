import type { ActionName, TurnAction } from "./codec";
import { type Level, loadLevel, MAX_TURNS } from "./core/level";
import { getLevelConfig, type LevelConfig } from "./core/level-config";
import type { TurnEvent } from "./core/logger";
import { createFacade, type TurnFacade, type WarriorTurn } from "./facade";
import type { TowerLevelRef } from "./level-ref";
import { getLevelScore, type LevelScore } from "./scoring";
import { verifyRelativeDirection } from "./spatial";
import { isTowerId, TOWERS } from "./towers";

export type { WarriorTurn } from "./facade";

export interface TurnRecord {
  /** 1-based turn number. */
  t: number;
  action: TurnAction;
  /** Every event of the turn, the warrior's first, each with a full floor snapshot. */
  events: TurnEvent[];
}

export type RunStatus = "playing" | "passed" | "failed" | "out-of-turns" | "engine-error";

/** Why a step did not produce a turn. An engine error ends the run; the others leave it as it was. */
export type RunFailure =
  | { kind: "engine-error"; message: string }
  /** The floor does not give the warrior this ability yet. */
  | { kind: "ungranted-action"; action: ActionName }
  /** The action itself is malformed (for example a direction that is not one). */
  | { kind: "invalid-action"; message: string }
  /** The run already ended. */
  | { kind: "run-over" };

export type StepResult = { ok: true; record: TurnRecord } | { ok: false; reason: RunFailure };

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
  /** Set once the run ended with an engine error; the half-played turn is not counted. */
  readonly failure: RunFailure | null;
  readonly initial: TurnEvent;
  /** The warrior's turn facade for this turn; call its abilities, then endTurn. */
  beginTurn(): WarriorTurn;
  /**
   * Every other unit chooses, then all units act, in upstream order. An exception inside the
   * engine ends the run as "engine-error" instead of escaping with a half-applied turn.
   */
  endTurn(): StepResult;
  /** Step with a known action (replays, hand mode, the server). */
  step(action: TurnAction): StepResult;
  result(): RunResult;
}

/**
 * Builds the level config for a tower floor; throws for a tower or level that does not exist.
 * The ref may come from an untrusted request, so the tower id is checked before it indexes.
 */
export function configForRef(ref: TowerLevelRef, warriorName: string): LevelConfig {
  if (!isTowerId(ref.tower)) {
    throw new Error(`no tower "${String(ref.tower)}"`);
  }
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
  private lastFailure: RunFailure | null = null;

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

  get failure(): RunFailure | null {
    return this.lastFailure;
  }

  /** Ends the run on an engine exception; the turn in flight is dropped, never half-applied. */
  private fail(error: unknown): StepResult {
    this.current?.revoke();
    this.current = null;
    this.currentStatus = "engine-error";
    this.lastFailure = {
      kind: "engine-error",
      message: error instanceof Error ? error.message : String(error),
    };
    return { ok: false, reason: this.lastFailure };
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

  endTurn(): StepResult {
    const facade = this.current;
    if (!facade) {
      throw new Error("No turn in progress: call beginTurn first.");
    }
    facade.revoke();

    try {
      return this.playTurn(facade);
    } catch (error) {
      return this.fail(error);
    }
  }

  private playTurn(facade: TurnFacade): StepResult {
    this.current = null;
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
      ok: true,
      record: {
        t: this.played,
        action: facade.action(),
        events: this.level.logger.lastTurn ?? [],
      },
    };
  }

  step(action: TurnAction): StepResult {
    if (this.currentStatus !== "playing") {
      return { ok: false, reason: { kind: "run-over" } };
    }
    // Check everything that could fail before the turn begins, so a refused action leaves the
    // run exactly as it was.
    if (action) {
      if (!this.level.floor.warrior?.abilities.has(action.name)) {
        return { ok: false, reason: { kind: "ungranted-action", action: action.name } };
      }
      if (action.direction !== null) {
        try {
          verifyRelativeDirection(action.direction);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { ok: false, reason: { kind: "invalid-action", message } };
        }
      }
    }
    const turn = this.beginTurn();
    try {
      if (action) {
        const act = turn[action.name];
        if (action.direction === null) {
          act?.();
        } else {
          act?.(action.direction);
        }
      }
    } catch (error) {
      return this.fail(error);
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

export type ReplayResult =
  | { ok: true; records: TurnRecord[]; result: RunResult; consumed: number }
  /** `at` is the index of the action that could not be played; `records` are the turns before it. */
  | { ok: false; reason: RunFailure; at: number; records: TurnRecord[] };

/**
 * Replays an action log from the start. Stops at the first terminal status and reports how many
 * actions it consumed (the server rejects a log with leftovers). An action the floor does not
 * grant, or an engine error, comes back as a typed failure with its position.
 */
export function replayLog(config: LevelConfig, actions: readonly TurnAction[]): ReplayResult {
  const run = createRun(config);
  const records: TurnRecord[] = [];
  let consumed = 0;
  for (const action of actions) {
    if (run.status !== "playing") {
      break;
    }
    const stepped = run.step(action);
    if (!stepped.ok) {
      return { ok: false, reason: stepped.reason, at: consumed, records };
    }
    records.push(stepped.record);
    consumed += 1;
  }
  return { ok: true, records, result: run.result(), consumed };
}
