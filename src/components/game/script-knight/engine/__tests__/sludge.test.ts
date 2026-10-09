// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/units/src/Sludge.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test } from "vitest";
import { MeleeUnit, Sludge } from "../units";

describe("Sludge", () => {
  let sludge: Sludge;

  beforeEach(() => {
    sludge = new Sludge();
  });

  test("extends MeleeUnit", () => {
    expect(sludge).toBeInstanceOf(MeleeUnit);
  });

  test("has 12 max health", () => {
    expect(sludge.maxHealth).toBe(12);
  });

  test("has attack ability", () => {
    expect(Sludge.declaredAbilities).toHaveProperty("attack");
  });

  test("has feel ability", () => {
    expect(Sludge.declaredAbilities).toHaveProperty("feel");
  });
});
