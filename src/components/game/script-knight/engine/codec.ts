/**
 * The action log: the warrior's one action per turn, as a short string. A run is fully
 * determined by its level and this log (the engine has no hidden randomness), so the log is what
 * the server re-simulates and what a replay link carries.
 *
 * Format: "1:" then two characters per turn, an action letter and a direction digit.
 * Letters: w walk, a attack, r rest, s rescue, p pivot, h shoot, b bind, d detonate, . idle.
 * Digits: 0 forward, 1 right, 2 backward, 3 left, - none (rest and idle always; any other action
 * called with no argument, meaning its own default, which differs per ability).
 */
export const LOG_VERSION = "1";
export const MAX_LOG_TOKENS = 200;

/** Matches exactly the logs `decodeLog` accepts: rest and idle take `-`, nothing else does. */
export const ACTION_LOG_RE = /^1:(?:[wasphbd][0-3-]|r-|\.-){0,200}$/;

export type ActionName =
  "walk" | "attack" | "rest" | "rescue" | "pivot" | "shoot" | "bind" | "detonate";
export type Direction = "forward" | "right" | "backward" | "left";
/** One turn: an action with its direction (null means "no argument"), or null for no action. */
export type TurnAction = { name: ActionName; direction: Direction | null } | null;

const LETTER_OF: Record<ActionName, string> = {
  walk: "w",
  attack: "a",
  rest: "r",
  rescue: "s",
  pivot: "p",
  shoot: "h",
  bind: "b",
  detonate: "d",
};
const ACTION_OF: Record<string, ActionName> = {
  w: "walk",
  a: "attack",
  r: "rest",
  s: "rescue",
  p: "pivot",
  h: "shoot",
  b: "bind",
  d: "detonate",
};
const DIRECTIONS: readonly Direction[] = ["forward", "right", "backward", "left"];

/**
 * Why a value is not a turn action the log can carry, or null when it is one. The input may come
 * from an untrusted request, so nothing is assumed about its shape.
 */
export function invalidActionReason(action: unknown): string | null {
  if (action === null) {
    return null;
  }
  if (typeof action !== "object" || Array.isArray(action)) {
    return "an action is an object or null";
  }
  const { name, direction } = action as { name?: unknown; direction?: unknown };
  if (typeof name !== "string" || !Object.hasOwn(LETTER_OF, name)) {
    return `'${String(name)}' is not one of the eight actions`;
  }
  if (direction !== null && !DIRECTIONS.includes(direction as Direction)) {
    return `'${String(direction)}' is not a direction: use forward, right, backward or left, or null`;
  }
  if (name === "rest" && direction !== null) {
    return "rest takes no direction";
  }
  return null;
}

export function encodeAction(action: TurnAction): string {
  const reason = invalidActionReason(action);
  if (reason !== null) {
    throw new Error(reason);
  }
  if (action === null) {
    return ".-";
  }
  const letter = LETTER_OF[action.name];
  if (action.name === "rest") {
    return `${letter}-`;
  }
  return `${letter}${action.direction === null ? "-" : DIRECTIONS.indexOf(action.direction)}`;
}

export function encodeLog(actions: readonly TurnAction[]): string {
  if (actions.length > MAX_LOG_TOKENS) {
    throw new Error(`an action log holds at most ${MAX_LOG_TOKENS} turns`);
  }
  return `${LOG_VERSION}:${actions.map(encodeAction).join("")}`;
}

/** null for anything that is not exactly a valid log. */
export function decodeLog(text: string): TurnAction[] | null {
  if (typeof text !== "string" || !ACTION_LOG_RE.test(text)) {
    return null;
  }
  const actions: TurnAction[] = [];
  for (let i = 2; i < text.length; i += 2) {
    const letter = text.charAt(i);
    const digit = text.charAt(i + 1);
    if (letter === ".") {
      actions.push(null);
      continue;
    }
    const name = ACTION_OF[letter];
    if (name === undefined) {
      return null;
    }
    actions.push({ name, direction: digit === "-" ? null : (DIRECTIONS[Number(digit)] ?? null) });
  }
  return actions;
}
