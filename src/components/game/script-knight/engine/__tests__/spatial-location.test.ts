// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/spatial/src/location.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { describe, expect, test } from "vitest";
import {
  EAST,
  NORTH,
  SOUTH,
  WEST,
  getDirectionOfLocation,
  getDistanceOfLocation,
  translateLocation,
} from "../spatial";

describe("translateLocation", () => {
  test("translates the given location by the given offset", () => {
    expect(translateLocation([1, 2], [2, -1])).toEqual([3, 1]);
  });
});

describe("getDirectionOfLocation", () => {
  test("returns the direction from a given location to another given location", () => {
    expect(getDirectionOfLocation([1, 1], [1, 2])).toEqual(NORTH);
    expect(getDirectionOfLocation([2, 2], [1, 2])).toEqual(EAST);
    expect(getDirectionOfLocation([1, 3], [1, 2])).toEqual(SOUTH);
    expect(getDirectionOfLocation([0, 2], [1, 2])).toEqual(WEST);
  });
});

describe("getDistanceOfLocation", () => {
  test("returns the distance between the two given locations", () => {
    expect(getDistanceOfLocation([5, 3], [1, 2])).toBe(5);
    expect(getDistanceOfLocation([4, 2], [1, 2])).toBe(3);
  });
});
