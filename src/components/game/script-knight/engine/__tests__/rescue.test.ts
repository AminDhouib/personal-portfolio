// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/abilities/src/Rescue.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { Action } from "../core/ability";
import { FORWARD, RIGHT } from "../spatial";
import { Rescue } from "../abilities";
import { asUnit, type Rec } from "./helpers";

describe("Rescue", () => {
  let rescue: Rescue;
  let unit: Rec;

  beforeEach(() => {
    unit = {
      release: vi.fn(),
      emit: vi.fn(),
    };
    rescue = new Rescue(asUnit(unit));
  });

  test("is an action", () => {
    expect(rescue).toBeInstanceOf(Action);
  });

  test("has a description", () => {
    expect(rescue.description).toBe(
      `Releases a unit from their chains in the given direction (\`'${FORWARD}'\` by default).`,
    );
  });

  test("has meta for type generation", () => {
    expect(rescue.meta).toEqual({
      params: [{ name: "direction", type: "Direction", optional: true }],
      returns: "void",
    });
  });

  describe("performing", () => {
    test("rescues forward by default", () => {
      unit.getSpaceAt = vi.fn(() => ({ getUnit: () => null }));
      rescue.perform();
      expect(unit.getSpaceAt).toHaveBeenCalledWith(FORWARD);
    });

    test("allows to specify direction", () => {
      unit.getSpaceAt = vi.fn(() => ({ getUnit: () => null }));
      rescue.perform(RIGHT);
      expect(unit.getSpaceAt).toHaveBeenCalledWith(RIGHT);
    });

    test("misses if no receiver", () => {
      unit.getSpaceAt = () => ({ getUnit: () => null });
      rescue.perform();
      expect(unit.emit).toHaveBeenCalledWith({
        type: "rescue",
        description: "unbinds {direction} and rescues nothing",
        params: { direction: FORWARD },
      });
    });

    describe("with receiver", () => {
      let receiver: Rec;

      beforeEach(() => {
        receiver = {
          name: "receiver",
          isWarrior: () => false,
          isBound: () => true,
        };
        unit.getSpaceAt = () => ({ getUnit: () => receiver });
      });

      test("does nothing to receiver if it's not bound", () => {
        receiver.isBound = () => false;
        rescue.perform();
        expect(unit.emit).toHaveBeenCalledWith({
          type: "rescue",
          description: "unbinds {direction} and rescues nothing",
          params: { direction: FORWARD },
        });
        expect(unit.release).not.toHaveBeenCalled();
      });

      test("releases receiver", () => {
        rescue.perform();
        expect(unit.emit).toHaveBeenCalledWith({
          type: "rescue",
          description: "unbinds {direction} and rescues {target}",
          params: {
            direction: FORWARD,
            target: { type: "unit", name: "receiver", warrior: false },
          },
        });
        expect(unit.release).toHaveBeenCalledWith(receiver);
      });
    });
  });
});
