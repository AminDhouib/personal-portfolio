// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/units/src/ThickSludge.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test } from "vitest";
import { MeleeUnit, ThickSludge } from "../units";

describe("ThickSludge", () => {
  let thickSludge: ThickSludge;

  beforeEach(() => {
    thickSludge = new ThickSludge();
  });

  test("extends MeleeUnit", () => {
    expect(thickSludge).toBeInstanceOf(MeleeUnit);
  });

  test("has 24 max health", () => {
    expect(thickSludge.maxHealth).toBe(24);
  });

  test("has attack ability", () => {
    expect(ThickSludge.declaredAbilities).toHaveProperty("attack");
  });

  test("has feel ability", () => {
    expect(ThickSludge.declaredAbilities).toHaveProperty("feel");
  });
});
