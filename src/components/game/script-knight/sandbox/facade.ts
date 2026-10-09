import { formatThought } from "../engine/abilities";
import type { WarriorTurn } from "../engine/facade";
import { TOWERS } from "../engine/towers";
import { MAX_MESSAGE_CHARS, MAX_THOUGHT_LINES } from "./protocol";

/** Ability calls (senses and actions alike) one turn may make before the facade refuses. */
export const MAX_CALLS_PER_TURN = 1_000;

/** A broken rule of the game (as opposed to a bug in the player's own code). */
export class RuleError extends Error {
  override name = "RuleError";
}

export interface CappedTurn {
  /** The frozen object handed to `playTurn`. */
  readonly turn: WarriorTurn;
  /** The think lines kept this turn: at most 10, each at most 200 chars. */
  thoughts(): string[];
  /** After this, every method throws instead of acting. */
  revoke(): void;
}

/**
 * Wraps the engine's turn facade with the sandbox's per-turn caps: at most 1,000 ability calls,
 * 10 kept think lines. Every error that comes out of an ability is re-thrown as a RuleError with
 * the engine's own text, so the worker can show it bare, and a stored reference throws once the
 * turn is over.
 */
export function capTurn(inner: WarriorTurn): CappedTurn {
  const thoughts: string[] = [];
  let calls = 0;
  let live = true;
  const methods: Record<string, (...args: unknown[]) => unknown> = {};

  for (const [name, ability] of Object.entries(inner)) {
    methods[name] = (...args: unknown[]): unknown => {
      if (!live) {
        throw new RuleError("That turn is over");
      }
      calls += 1;
      if (calls > MAX_CALLS_PER_TURN) {
        throw new RuleError("Too many senses in one turn.");
      }
      if (name === "think") {
        if (thoughts.length >= MAX_THOUGHT_LINES) {
          return undefined;
        }
        thoughts.push(args.length > 0 ? formatThought(args) : "nothing");
      }
      try {
        return ability(...args);
      } catch (err) {
        throw new RuleError(err instanceof Error ? err.message : String(err));
      }
    };
  }

  return {
    turn: Object.freeze(methods),
    thoughts: () => [...thoughts],
    revoke() {
      live = false;
    },
  };
}

/** Every ability name any tower grants on any floor. */
export function allAbilityNames(): string[] {
  const names = new Set<string>();
  for (const tower of Object.values(TOWERS)) {
    for (const level of tower.levels) {
      for (const name of Object.keys(level.floor.warrior.abilities ?? {})) {
        names.add(name);
      }
    }
  }
  return [...names];
}

const NOT_A_FUNCTION = /\.(\w+) is not a function/;

/**
 * The text the player sees for an error thrown out of `playTurn`. A rule error is shown bare;
 * calling an ability the floor has not granted yet (the facade has no such method, so the engine
 * says "x.shoot is not a function") gets the floor's own wording; anything else is the player's
 * own error, named by type.
 */
export function describePlayerError(err: unknown, granted: readonly string[]): string {
  try {
    if (err instanceof RuleError) {
      return err.message.slice(0, MAX_MESSAGE_CHARS);
    }
    const missing = err instanceof TypeError ? NOT_A_FUNCTION.exec(err.message)?.[1] : undefined;
    if (
      missing !== undefined &&
      allAbilityNames().includes(missing) &&
      !granted.includes(missing)
    ) {
      return `This floor does not give you ${missing} yet.`;
    }
  } catch {
    // silent-ok: a hostile error object; the player is shown the generic text
    return UNPRINTABLE;
  }
  return describeThrown(err);
}

export const UNPRINTABLE = "Your code threw a value that could not be printed.";

/** "Name: message" for an error, or the value as text; never throws, whatever was thrown. */
export function describeThrown(err: unknown): string {
  try {
    const text = err instanceof Error ? `${err.name}: ${err.message}` : `Error: ${String(err)}`;
    return text.slice(0, MAX_MESSAGE_CHARS);
  } catch {
    // silent-ok: a hostile error object (throwing getter or toString); shown as generic text
    return UNPRINTABLE;
  }
}
