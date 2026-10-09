// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/abilities/src/DistanceOf.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { Sense } from "../core/ability";
import { DistanceOf } from "../abilities";
import { asUnit, mocked, type Rec } from "./helpers";

describe("DistanceOf", () => {
  let distanceOf: DistanceOf;
  let unit: Rec;

  beforeEach(() => {
    unit = { getDistanceOf: vi.fn() };
    distanceOf = new DistanceOf(asUnit(unit));
  });

  test("is a sense", () => {
    expect(distanceOf).toBeInstanceOf(Sense);
  });

  test("has a description", () => {
    expect(distanceOf.description).toBe(
      "Returns an integer representing the distance to the given space.",
    );
  });

  test("has meta for type generation", () => {
    expect(distanceOf.meta).toEqual({
      params: [{ name: "space", type: "Space" }],
      returns: "number",
    });
  });

  describe("performing", () => {
    test("returns distance of specified space", () => {
      mocked(unit.getDistanceOf).mockReturnValue(3);
      expect(distanceOf.perform({} as never)).toBe(3);
    });
  });
});
