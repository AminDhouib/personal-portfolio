// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/units/src/Wizard.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test } from "vitest";
import { RangedUnit, Wizard } from "../units";

describe("Wizard", () => {
  let wizard: Wizard;

  beforeEach(() => {
    wizard = new Wizard();
  });

  test("extends RangedUnit", () => {
    expect(wizard).toBeInstanceOf(RangedUnit);
  });

  test("has 3 max health", () => {
    expect(wizard.maxHealth).toBe(3);
  });

  test("has shoot ability", () => {
    expect(Wizard.declaredAbilities).toHaveProperty("shoot");
  });

  test("has look ability", () => {
    expect(Wizard.declaredAbilities).toHaveProperty("look");
  });
});
