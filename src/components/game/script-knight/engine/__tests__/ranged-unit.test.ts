// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/units/src/RangedUnit.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { BACKWARD, FORWARD, LEFT, RIGHT } from "../spatial";
import { RangedUnit } from "../units";
import { asTurn, mocked, type Rec } from "./helpers";

class TestRangedUnit extends RangedUnit {
  override readonly name = "Ranged";
  override readonly maxHealth = 8;
}

describe("RangedUnit", () => {
  let unit: TestRangedUnit;
  let turn: Rec;
  let emptySpaces: Rec[];

  beforeEach(() => {
    unit = new TestRangedUnit();
    emptySpaces = [{ isUnit: () => false }, { isUnit: () => false }];
    turn = {
      shoot: vi.fn(),
      look: vi.fn(() => emptySpaces),
    };
  });

  test("looks in all directions for threats", () => {
    unit.playTurn(asTurn(turn));
    expect(turn.look).toHaveBeenCalledWith(FORWARD);
    expect(turn.look).toHaveBeenCalledWith(RIGHT);
    expect(turn.look).toHaveBeenCalledWith(BACKWARD);
    expect(turn.look).toHaveBeenCalledWith(LEFT);
  });

  test("shoots the first direction with an enemy", () => {
    mocked(turn.look).mockReturnValueOnce([
      { isUnit: () => false },
      { isUnit: () => true, getUnit: () => ({ isEnemy: () => true, isBound: () => false }) },
    ]);
    unit.playTurn(asTurn(turn));
    expect(turn.shoot).toHaveBeenCalledWith(FORWARD);
  });

  test("does not shoot if no enemies found", () => {
    unit.playTurn(asTurn(turn));
    expect(turn.shoot).not.toHaveBeenCalled();
  });

  test("does not shoot bound enemies", () => {
    mocked(turn.look).mockReturnValue([
      { isUnit: () => true, getUnit: () => ({ isEnemy: () => true, isBound: () => true }) },
    ]);
    unit.playTurn(asTurn(turn));
    expect(turn.shoot).not.toHaveBeenCalled();
  });

  test("does not shoot non-enemies", () => {
    mocked(turn.look).mockReturnValue([
      { isUnit: () => true, getUnit: () => ({ isEnemy: () => false, isBound: () => false }) },
    ]);
    unit.playTurn(asTurn(turn));
    expect(turn.shoot).not.toHaveBeenCalled();
  });

  test("stops looking once it finds a threat", () => {
    mocked(turn.look)
      .mockReturnValueOnce([{ isUnit: () => false }])
      .mockReturnValueOnce([
        { isUnit: () => true, getUnit: () => ({ isEnemy: () => true, isBound: () => false }) },
      ]);
    unit.playTurn(asTurn(turn));
    expect(turn.look).toHaveBeenCalledTimes(2);
    expect(turn.shoot).toHaveBeenCalledWith(RIGHT);
  });
});
