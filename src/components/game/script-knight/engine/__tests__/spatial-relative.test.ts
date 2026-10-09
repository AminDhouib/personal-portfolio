// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/spatial/src/relativeDirections.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test } from "vitest";
import {
  type AbsoluteDirection,
  EAST,
  NORTH,
  SOUTH,
  WEST,
  BACKWARD,
  FORWARD,
  getRelativeDirection,
  getRelativeOffset,
  LEFT,
  RELATIVE_DIRECTIONS,
  RIGHT,
  rotateRelativeOffset,
  verifyRelativeDirection,
} from "../spatial";

test("exports a FORWARD constant whose value is 'forward'", () => {
  expect(FORWARD).toBe("forward");
});

test("exports a RIGHT constant whose value is 'right'", () => {
  expect(RIGHT).toBe("right");
});

test("exports a BACKWARD constant whose value is 'backward'", () => {
  expect(BACKWARD).toBe("backward");
});

test("exports a LEFT constant whose value is 'left'", () => {
  expect(LEFT).toBe("left");
});

test("exports an array with the relative directions in clockwise order", () => {
  expect(RELATIVE_DIRECTIONS).toEqual([FORWARD, RIGHT, BACKWARD, LEFT]);
});

describe("verifyRelativeDirection", () => {
  test("doesn't throw if direction is valid", () => {
    const validDirections = RELATIVE_DIRECTIONS;
    validDirections.forEach((validDirection) => verifyRelativeDirection(validDirection));
  });

  test("throws an error if direction is not valid", () => {
    const invalidDirections = ["", "foo", "forward\n", "Forward", "backwards"];
    invalidDirections.forEach((invalidDirection) => {
      expect(() => {
        verifyRelativeDirection(invalidDirection);
      }).toThrow(
        `'${invalidDirection}' is not a direction: use ${FORWARD}, ${RIGHT}, ${BACKWARD} or ${LEFT}.`,
      );
    });
  });
});

describe("getRelativeDirection", () => {
  let direction: AbsoluteDirection;

  describe("north", () => {
    beforeEach(() => {
      direction = NORTH;
    });

    test("is forward when facing north", () => {
      expect(getRelativeDirection(direction, NORTH)).toBe(FORWARD);
    });

    test("is to the left when facing east", () => {
      expect(getRelativeDirection(direction, EAST)).toBe(LEFT);
    });

    test("is backward when facing south", () => {
      expect(getRelativeDirection(direction, SOUTH)).toBe(BACKWARD);
    });

    test("is to the right when facing west", () => {
      expect(getRelativeDirection(direction, WEST)).toBe(RIGHT);
    });
  });

  describe("east", () => {
    beforeEach(() => {
      direction = EAST;
    });

    test("is to the right when facing north", () => {
      expect(getRelativeDirection(direction, NORTH)).toBe(RIGHT);
    });

    test("is forward when facing east", () => {
      expect(getRelativeDirection(direction, EAST)).toBe(FORWARD);
    });

    test("is to the left when facing south", () => {
      expect(getRelativeDirection(direction, SOUTH)).toBe(LEFT);
    });

    test("is backward when facing west", () => {
      expect(getRelativeDirection(direction, WEST)).toBe(BACKWARD);
    });
  });

  describe("south", () => {
    beforeEach(() => {
      direction = SOUTH;
    });

    test("is backward when facing north", () => {
      expect(getRelativeDirection(direction, NORTH)).toBe(BACKWARD);
    });

    test("is to the right when facing east", () => {
      expect(getRelativeDirection(direction, EAST)).toBe(RIGHT);
    });

    test("is forward when facing south", () => {
      expect(getRelativeDirection(direction, SOUTH)).toBe(FORWARD);
    });

    test("is to the left when facing west", () => {
      expect(getRelativeDirection(direction, WEST)).toBe(LEFT);
    });
  });

  describe("west", () => {
    beforeEach(() => {
      direction = WEST;
    });

    test("is to the left when facing north", () => {
      expect(getRelativeDirection(direction, NORTH)).toBe(LEFT);
    });

    test("is backward when facing east", () => {
      expect(getRelativeDirection(direction, EAST)).toBe(BACKWARD);
    });

    test("is to the right when facing south", () => {
      expect(getRelativeDirection(direction, SOUTH)).toBe(RIGHT);
    });

    test("is forward when facing west", () => {
      expect(getRelativeDirection(direction, WEST)).toBe(FORWARD);
    });
  });
});

describe("getRelativeOffset", () => {
  test("returns the relative offset based on location and direction", () => {
    expect(getRelativeOffset([3, 3], [1, 2], NORTH)).toEqual([-1, 2]);
    expect(getRelativeOffset([3, 3], [1, 2], EAST)).toEqual([2, 1]);
    expect(getRelativeOffset([3, 3], [1, 2], SOUTH)).toEqual([1, -2]);
    expect(getRelativeOffset([3, 3], [1, 2], WEST)).toEqual([-2, -1]);
    expect(getRelativeOffset([0, 0], [1, 2], NORTH)).toEqual([2, -1]);
    expect(getRelativeOffset([0, 0], [1, 2], EAST)).toEqual([-1, -2]);
    expect(getRelativeOffset([0, 0], [1, 2], SOUTH)).toEqual([-2, 1]);
    expect(getRelativeOffset([0, 0], [1, 2], WEST)).toEqual([1, 2]);
  });
});

describe("rotateRelativeOffset", () => {
  test("rotates the relative offset in the given direction", () => {
    expect(rotateRelativeOffset([1, 2], FORWARD)).toEqual([1, 2]);
    expect(rotateRelativeOffset([1, 2], RIGHT)).toEqual([-2, 1]);
    expect(rotateRelativeOffset([1, 2], BACKWARD)).toEqual([-1, -2]);
    expect(rotateRelativeOffset([1, 2], LEFT)).toEqual([2, -1]);
  });
});
