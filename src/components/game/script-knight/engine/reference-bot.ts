import type { Direction, TurnAction } from "./codec";
import type { LevelConfig } from "./core/level-config";
import type { WarriorTurn } from "./facade";
import { createRun, type RunResult, type RunStatus } from "./run";

/**
 * The reference bot: a hand-written Player for the Narrow Path ability set. It is our code, not
 * upstream's. T7-5 uses it to check that a generated daily corridor can be cleared, and to show
 * its score as par. It only calls abilities the floor grants, so it also runs (poorly) on the
 * early floors with fewer of them.
 */

interface BotUnit {
  isBound(): boolean;
  isEnemy(): boolean;
}

interface BotSpace {
  isUnit(): boolean;
  isWall(): boolean;
  isStairs(): boolean;
  getUnit(): BotUnit | null;
}

export type BotPlayTurn = (turn: WarriorTurn) => void;

const SIDES: readonly Direction[] = ["forward", "backward", "right", "left"];
/** How far an archer or a wizard reaches; melee units only ever matter beside the warrior. */
const RANGED_REACH = 3;

interface Threat {
  direction: Direction;
  distance: number;
}

/** A fresh bot: it remembers its health from the previous turn, so make one per run. */
export function createReferenceBot(): BotPlayTurn {
  let lastHealth: number | null = null;

  return (turn) => {
    const has = (name: string): boolean => typeof turn[name] === "function";
    const call = <T>(name: string, ...args: unknown[]): T => turn[name]?.(...args) as T;
    const feel = (direction: Direction): BotSpace => call<BotSpace>("feel", direction);
    const look = (direction: Direction): BotSpace[] => call<BotSpace[]>("look", direction);

    const health = has("health") ? call<number>("health") : null;
    const maxHealth = has("maxHealth") ? call<number>("maxHealth") : 20;
    const underFire = lastHealth !== null && health !== null && health < lastHealth;
    lastHealth = health;

    // 1. Anything beside us: free a captive, otherwise fight.
    if (has("feel")) {
      for (const direction of SIDES) {
        const unit = feel(direction).getUnit();
        if (!unit) continue;
        if (unit.isBound() && !unit.isEnemy() && has("rescue")) {
          return void call("rescue", direction);
        }
        if (unit.isEnemy() && !unit.isBound()) {
          return void call("attack", direction);
        }
      }
    }

    // 2. Something in a line. The first unit each way is the only one that can see us, so those
    // are the possible archers. A melee unit two spaces off is harmless, but we cannot tell it
    // from an archer, so when both ways have one we deal with the farther one first: a sludge in
    // front of an archer is the usual shape of the danger.
    if (has("look")) {
      const ahead = look("forward");
      const behind = look("backward");
      const threats: Threat[] = [];
      for (const [direction, spaces] of [
        ["forward", ahead],
        ["backward", behind],
      ] as const) {
        const index = spaces.findIndex((space) => space.isUnit());
        const unit = index >= 0 ? spaces[index]?.getUnit() : null;
        if (unit && unit.isEnemy() && !unit.isBound() && index < RANGED_REACH) {
          threats.push({ direction, distance: index + 1 });
        }
      }
      if (has("shoot") && threats.length > 0) {
        const target = threats.reduce((far, next) => (next.distance > far.distance ? next : far));
        if (target.direction === "forward") {
          return void call("shoot", "forward");
        }
        if (has("pivot")) {
          return void call("pivot", "backward");
        }
      }

      const aheadUnit = ahead.find((space) => space.isUnit());
      const behindUnit = behind.find((space) => space.isUnit())?.getUnit();
      const stairsAhead = ahead.some((space) => space.isStairs());
      if (has("pivot") && behindUnit && !aheadUnit && !stairsAhead) {
        return void call("pivot", "backward");
      }
      if (has("pivot") && behindUnit && behindUnit.isBound() && !behindUnit.isEnemy()) {
        return void call("pivot", "backward");
      }
    }

    // 3. Heal when nobody is hurting us; back away when we are low and being hit.
    if (health !== null && has("rest") && health < maxHealth * 0.6 && !underFire) {
      return void call("rest");
    }
    if (health !== null && underFire && health < maxHealth * 0.35 && has("walk")) {
      return void call("walk", "backward");
    }

    // 4. Go on. A wall ahead means the way out is behind us.
    if (has("feel") && has("pivot") && feel("forward").isWall()) {
      return void call("pivot", "backward");
    }
    return void call("walk", "forward");
  };
}

/** Plays a whole floor with a bot, through the same step API as everything else. */
export function playWithBot(
  config: LevelConfig,
  bot: BotPlayTurn = createReferenceBot(),
): { actions: TurnAction[]; status: RunStatus; result: RunResult } {
  const run = createRun(config);
  const actions: TurnAction[] = [];
  while (run.status === "playing") {
    bot(run.beginTurn());
    const stepped = run.endTurn();
    if (stepped.ok) {
      actions.push(stepped.record.action);
    }
  }
  return { actions, status: run.status, result: run.result() };
}
