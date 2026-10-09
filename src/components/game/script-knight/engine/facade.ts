import { Action } from "./core/ability";
import type { Warrior } from "./core/warrior";
import type { TurnAction, ActionName, Direction } from "./codec";
import { verifyRelativeDirection } from "./spatial";

/** What player code sees as `warrior`: a frozen bag of ability methods and nothing else. */
export interface WarriorTurn {
  readonly [ability: string]: (...args: unknown[]) => unknown;
}

export interface TurnFacade {
  /** The object handed to `playTurn`. */
  readonly turn: WarriorTurn;
  /** The one action chosen this turn, or null if none was. */
  action(): TurnAction;
  /** After this, every method on `turn` throws instead of acting. */
  revoke(): void;
}

/**
 * Builds the pure turn facade over a warrior whose abilities are loaded. Action methods record
 * into the warrior's turn state (a second one throws the upstream text); senses run at once.
 * Directions are checked at the call, so a bad one fails the call and leaves the turn's action
 * unspent. The sandbox in T7-2 wraps these methods with its per-turn caps.
 */
export function createFacade(warrior: Warrior): TurnFacade {
  const state = warrior.getNextTurn();
  warrior.turn = state;
  let live = true;
  const methods: Record<string, (...args: unknown[]) => unknown> = {};

  for (const [name, ability] of warrior.abilities) {
    const isAction = ability instanceof Action;
    methods[name] = (...args: unknown[]): unknown => {
      if (!live) {
        throw new Error("That turn is over");
      }
      const fn = Reflect.get(state, name) as (...fnArgs: unknown[]) => unknown;
      // Actions take at most a direction, and rest takes none: drop everything else so the
      // recorded action is exactly what the log can carry.
      if (isAction) {
        const direction = name === "rest" ? undefined : args[0];
        if (direction !== undefined) {
          verifyRelativeDirection(direction);
        }
        return direction === undefined ? fn.call(state) : fn.call(state, direction);
      }
      return fn.call(state, ...args);
    };
  }

  return {
    turn: Object.freeze(methods),
    action(): TurnAction {
      if (!state.action) {
        return null;
      }
      const [name, args] = state.action;
      const direction = args[0];
      return {
        name: name as ActionName,
        direction: typeof direction === "string" ? (direction as Direction) : null,
      };
    },
    revoke() {
      live = false;
    },
  };
}
