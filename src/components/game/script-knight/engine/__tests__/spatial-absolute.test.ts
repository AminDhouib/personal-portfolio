// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/spatial/src/absoluteDirections.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test } from "vitest";
import {
  ABSOLUTE_DIRECTIONS,
  EAST,
  getAbsoluteDirection,
  getAbsoluteOffset,
  NORTH,
  SOUTH,
  verifyAbsoluteDirection,
  WEST,
  BACKWARD,
  FORWARD,
  LEFT,
  type RelativeDirection,
  RIGHT,
} from "../spatial";

test("exports a NORTH constant whose value is 'north'", () => {
  expect(NORTH).toBe("north");
});

test("exports a EAST constant whose value is 'east'", () => {
  expect(EAST).toBe("east");
});

test("exports a SOUTH constant whose value is 'south'", () => {
  expect(SOUTH).toBe("south");
});

test("exports a WEST constant whose value is 'west'", () => {
  expect(WEST).toBe("west");
});

test("exports an array with the absolute directions in clockwise order", () => {
  expect(ABSOLUTE_DIRECTIONS).toEqual([NORTH, EAST, SOUTH, WEST]);
});

describe("verifyAbsoluteDirection", () => {
  test("doesn't throw if direction is valid", () => {
    const validDirections = ABSOLUTE_DIRECTIONS;
    validDirections.forEach((validDirection) => verifyAbsoluteDirection(validDirection));
  });

  test("throws an error if direction is not valid", () => {
    const invalidDirections = ["", "foo", "north\n", "North", "southern"];
    invalidDirections.forEach((invalidDirection) => {
      expect(() => {
        verifyAbsoluteDirection(invalidDirection);
      }).toThrow(
        `Unknown direction: '${invalidDirection}'. Should be one of: '${NORTH}', '${EAST}', '${SOUTH}' or '${WEST}'.`,
      );
    });
  });
});

describe("getAbsoluteDirection", () => {
  let direction: RelativeDirection;

  describe("forward", () => {
    beforeEach(() => {
      direction = FORWARD;
    });

    test("is to the north when facing north", () => {
      expect(getAbsoluteDirection(direction, NORTH)).toBe(NORTH);
    });

    test("is to the east when facing east", () => {
      expect(getAbsoluteDirection(direction, EAST)).toBe(EAST);
    });

    test("is to the south when facing south", () => {
      expect(getAbsoluteDirection(direction, SOUTH)).toBe(SOUTH);
    });

    test("is to the west when facing west", () => {
      expect(getAbsoluteDirection(direction, WEST)).toBe(WEST);
    });
  });

  describe("right", () => {
    beforeEach(() => {
      direction = RIGHT;
    });

    test("is to the east when facing north", () => {
      expect(getAbsoluteDirection(direction, NORTH)).toBe(EAST);
    });

    test("is to the south when facing east", () => {
      expect(getAbsoluteDirection(direction, EAST)).toBe(SOUTH);
    });

    test("is to the west when facing south", () => {
      expect(getAbsoluteDirection(direction, SOUTH)).toBe(WEST);
    });

    test("is to the north when facing west", () => {
      expect(getAbsoluteDirection(direction, WEST)).toBe(NORTH);
    });
  });

  describe("backward", () => {
    beforeEach(() => {
      direction = BACKWARD;
    });

    test("is to the south when facing north", () => {
      expect(getAbsoluteDirection(direction, NORTH)).toBe(SOUTH);
    });

    test("is to the west when facing east", () => {
      expect(getAbsoluteDirection(direction, EAST)).toBe(WEST);
    });

    test("is to the north when facing south", () => {
      expect(getAbsoluteDirection(direction, SOUTH)).toBe(NORTH);
    });

    test("is to the east when facing west", () => {
      expect(getAbsoluteDirection(direction, WEST)).toBe(EAST);
    });
  });

  describe("left", () => {
    beforeEach(() => {
      direction = LEFT;
    });

    test("is to the west when facing north", () => {
      expect(getAbsoluteDirection(direction, NORTH)).toBe(WEST);
    });

    test("is to the north when facing east", () => {
      expect(getAbsoluteDirection(direction, EAST)).toBe(NORTH);
    });

    test("is to the east when facing south", () => {
      expect(getAbsoluteDirection(direction, SOUTH)).toBe(EAST);
    });

    test("is to the south when facing west", () => {
      expect(getAbsoluteDirection(direction, WEST)).toBe(SOUTH);
    });
  });
});

describe("getAbsoluteOffset", () => {
  test("returns the absolute offset based on direction", () => {
    expect(getAbsoluteOffset([1, 2], NORTH)).toEqual([2, -1]);
    expect(getAbsoluteOffset([1, 2], EAST)).toEqual([1, 2]);
    expect(getAbsoluteOffset([1, 2], SOUTH)).toEqual([-2, 1]);
    expect(getAbsoluteOffset([1, 2], WEST)).toEqual([-1, -2]);
  });
});
