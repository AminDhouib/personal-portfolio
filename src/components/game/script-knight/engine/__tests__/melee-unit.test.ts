// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/units/src/MeleeUnit.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { BACKWARD, FORWARD, LEFT, RIGHT } from "../spatial";
import { MeleeUnit } from "../units";
import { asTurn, mocked, type Rec } from "./helpers";

class TestMeleeUnit extends MeleeUnit {
  override readonly name = "Melee";
  override readonly maxHealth = 10;
}

describe("MeleeUnit", () => {
  let unit: TestMeleeUnit;
  let turn: Rec;
  let space: Rec;

  beforeEach(() => {
    unit = new TestMeleeUnit();
    space = { getUnit: () => undefined };
    turn = {
      attack: vi.fn(),
      feel: vi.fn(() => space),
    };
  });

  test("feels in all directions looking for threats", () => {
    unit.playTurn(asTurn(turn));
    expect(turn.feel).toHaveBeenCalledWith(FORWARD);
    expect(turn.feel).toHaveBeenCalledWith(RIGHT);
    expect(turn.feel).toHaveBeenCalledWith(BACKWARD);
    expect(turn.feel).toHaveBeenCalledWith(LEFT);
  });

  test("attacks the first enemy it finds", () => {
    mocked(turn.feel).mockReturnValueOnce({
      getUnit: () => ({ isEnemy: () => true, isBound: () => false }),
    });
    unit.playTurn(asTurn(turn));
    expect(turn.attack).toHaveBeenCalledWith(FORWARD);
  });

  test("does not attack if no enemies found", () => {
    unit.playTurn(asTurn(turn));
    expect(turn.attack).not.toHaveBeenCalled();
  });

  test("does not attack bound enemies", () => {
    mocked(turn.feel).mockReturnValue({
      getUnit: () => ({ isEnemy: () => true, isBound: () => true }),
    });
    unit.playTurn(asTurn(turn));
    expect(turn.attack).not.toHaveBeenCalled();
  });

  test("does not attack non-enemies", () => {
    mocked(turn.feel).mockReturnValue({
      getUnit: () => ({ isEnemy: () => false, isBound: () => false }),
    });
    unit.playTurn(asTurn(turn));
    expect(turn.attack).not.toHaveBeenCalled();
  });

  test("stops looking once it finds a threat", () => {
    mocked(turn.feel)
      .mockReturnValueOnce({ getUnit: () => undefined })
      .mockReturnValueOnce({
        getUnit: () => ({ isEnemy: () => true, isBound: () => false }),
      });
    unit.playTurn(asTurn(turn));
    expect(turn.feel).toHaveBeenCalledTimes(2);
    expect(turn.attack).toHaveBeenCalledWith(RIGHT);
  });
});
