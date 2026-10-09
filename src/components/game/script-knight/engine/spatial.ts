// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/spatial/src/*.ts. Copyright (c) 2015-present Matias Olivera. MIT licence: see ./LICENSE.
// Modified by Amin Dhouib, 2026: three modules merged; unknown directions get a player message.

/** A location as [x, y]. */
export type Location = [number, number];

/** An absolute offset as [deltaX, deltaY]. */
export type AbsoluteOffset = [number, number];

/** A relative offset as [forward, right]. */
export type RelativeOffset = [number, number];

export const NORTH = "north";
export const EAST = "east";
export const SOUTH = "south";
export const WEST = "west";

/** The absolute directions in clockwise order. */
export const ABSOLUTE_DIRECTIONS = [NORTH, EAST, SOUTH, WEST] as const;

/** An absolute direction. */
export type AbsoluteDirection = (typeof ABSOLUTE_DIRECTIONS)[number];

export const FORWARD = "forward";
export const RIGHT = "right";
export const BACKWARD = "backward";
export const LEFT = "left";

/** The relative directions in clockwise order. */
export const RELATIVE_DIRECTIONS = [FORWARD, RIGHT, BACKWARD, LEFT] as const;

/** A relative direction. */
export type RelativeDirection = (typeof RELATIVE_DIRECTIONS)[number];

/**
 * Checks if the given direction is a valid absolute direction.
 *
 * @throws Will throw if the direction is not valid.
 */
export function verifyAbsoluteDirection(direction: string): asserts direction is AbsoluteDirection {
  if (!ABSOLUTE_DIRECTIONS.includes(direction as AbsoluteDirection)) {
    throw new Error(
      `Unknown direction: '${direction}'. Should be one of: '${NORTH}', '${EAST}', '${SOUTH}' or '${WEST}'.`,
    );
  }
}

/**
 * Checks if the given direction is a valid relative direction. Upstream let any other string
 * fall through to `left`; the port refuses it so the action-log alphabet stays closed.
 *
 * @throws Will throw if the direction is not valid.
 */
export function verifyRelativeDirection(
  direction: unknown,
): asserts direction is RelativeDirection {
  if (!RELATIVE_DIRECTIONS.includes(direction as RelativeDirection)) {
    throw new Error(
      `'${String(direction)}' is not a direction: use ${FORWARD}, ${RIGHT}, ${BACKWARD} or ${LEFT}.`,
    );
  }
}

/** Returns the absolute direction for a relative one, with reference to an absolute one. */
export function getAbsoluteDirection(
  direction: RelativeDirection,
  referenceDirection: AbsoluteDirection,
): AbsoluteDirection {
  const index =
    (ABSOLUTE_DIRECTIONS.indexOf(referenceDirection) + RELATIVE_DIRECTIONS.indexOf(direction)) % 4;
  return ABSOLUTE_DIRECTIONS[index] as AbsoluteDirection;
}

/** Returns the absolute offset [deltaX, deltaY] for a relative offset [forward, right]. */
export function getAbsoluteOffset(
  [forward, right]: RelativeOffset,
  referenceDirection: AbsoluteDirection,
): AbsoluteOffset {
  if (referenceDirection === NORTH) {
    return [right, -forward];
  }

  if (referenceDirection === EAST) {
    return [forward, right];
  }

  if (referenceDirection === SOUTH) {
    return [-right, forward];
  }

  return [-forward, -right];
}

/** Returns the relative direction for an absolute one, with reference to another absolute one. */
export function getRelativeDirection(
  direction: AbsoluteDirection,
  referenceDirection: AbsoluteDirection,
): RelativeDirection {
  const index =
    (ABSOLUTE_DIRECTIONS.indexOf(direction) -
      ABSOLUTE_DIRECTIONS.indexOf(referenceDirection) +
      RELATIVE_DIRECTIONS.length) %
    RELATIVE_DIRECTIONS.length;
  return RELATIVE_DIRECTIONS[index] as RelativeDirection;
}

/** Returns the relative offset [forward, right] of a location from a reference location. */
export function getRelativeOffset(
  [x1, y1]: Location,
  [x2, y2]: Location,
  referenceDirection: AbsoluteDirection,
): RelativeOffset {
  const [deltaX, deltaY] = [x1 - x2, y1 - y2];

  if (referenceDirection === "north") {
    return [-deltaY, deltaX];
  }

  if (referenceDirection === "east") {
    return [deltaX, deltaY];
  }

  if (referenceDirection === "south") {
    return [deltaY, -deltaX];
  }

  return [-deltaX, -deltaY];
}

/** Rotates the given relative offset [forward, right] in the given direction. */
export function rotateRelativeOffset(
  [forward, right]: RelativeOffset,
  direction: RelativeDirection,
): RelativeOffset {
  if (direction === FORWARD) {
    return [forward, right];
  }

  if (direction === RIGHT) {
    return [-right, forward];
  }

  if (direction === BACKWARD) {
    return [-forward, -right];
  }

  return [right, -forward];
}

/** Translates the given location [x, y] by an absolute offset [deltaX, deltaY]. */
export function translateLocation([x, y]: Location, [deltaX, deltaY]: AbsoluteOffset): Location {
  return [x + deltaX, y + deltaY];
}

/** Returns the direction of a location from a reference location. */
export function getDirectionOfLocation([x1, y1]: Location, [x2, y2]: Location): AbsoluteDirection {
  if (Math.abs(x2 - x1) > Math.abs(y2 - y1)) {
    if (x1 > x2) {
      return EAST;
    }

    return WEST;
  }

  if (y1 > y2) {
    return SOUTH;
  }

  return NORTH;
}

/** Returns the Manhattan distance of a location from a reference location. */
export function getDistanceOfLocation([x1, y1]: Location, [x2, y2]: Location): number {
  return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}
