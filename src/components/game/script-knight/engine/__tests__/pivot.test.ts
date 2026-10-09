// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/abilities/src/Pivot.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { Action } from "../core/ability";
import { BACKWARD, RIGHT } from "../spatial";
import { Pivot } from "../abilities";
import { asUnit, type Rec } from "./helpers";

describe("Pivot", () => {
  let pivot: Pivot;
  let unit: Rec;

  beforeEach(() => {
    unit = {
      rotate: vi.fn(),
      emit: vi.fn(),
    };
    pivot = new Pivot(asUnit(unit));
  });

  test("is an action", () => {
    expect(pivot).toBeInstanceOf(Action);
  });

  test("has a description", () => {
    expect(pivot.description).toBe(
      `Rotates in the given direction (\`'${BACKWARD}'\` by default).`,
    );
  });

  test("has meta for type generation", () => {
    expect(pivot.meta).toEqual({
      params: [{ name: "direction", type: "Direction", optional: true }],
      returns: "void",
    });
  });

  describe("performing", () => {
    test("flips around when not passing direction", () => {
      pivot.perform();
      expect(unit.emit).toHaveBeenCalledWith({
        type: "pivot",
        description: "pivots {direction}",
        params: { direction: BACKWARD },
      });
      expect(unit.rotate).toHaveBeenCalledWith(BACKWARD);
    });

    test("rotates in specified direction", () => {
      pivot.perform(RIGHT);
      expect(unit.emit).toHaveBeenCalledWith({
        type: "pivot",
        description: "pivots {direction}",
        params: { direction: RIGHT },
      });
      expect(unit.rotate).toHaveBeenCalledWith(RIGHT);
    });
  });
});
