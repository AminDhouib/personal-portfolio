// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/units/src/Archer.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test } from "vitest";
import { Archer, RangedUnit } from "../units";

describe("Archer", () => {
  let archer: Archer;

  beforeEach(() => {
    archer = new Archer();
  });

  test("extends RangedUnit", () => {
    expect(archer).toBeInstanceOf(RangedUnit);
  });

  test("has 7 max health", () => {
    expect(archer.maxHealth).toBe(7);
  });

  test("has shoot ability", () => {
    expect(Archer.declaredAbilities).toHaveProperty("shoot");
  });

  test("has look ability", () => {
    expect(Archer.declaredAbilities).toHaveProperty("look");
  });
});
