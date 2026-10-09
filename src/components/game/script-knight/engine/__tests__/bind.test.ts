// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/abilities/src/Bind.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { Action } from "../core/ability";
import { FORWARD, LEFT } from "../spatial";
import { Bind } from "../abilities";
import { asUnit, type Rec } from "./helpers";

describe("Bind", () => {
  let bind: Bind;
  let unit: Rec;

  beforeEach(() => {
    unit = { emit: vi.fn() };
    bind = new Bind(asUnit(unit));
  });

  test("is an action", () => {
    expect(bind).toBeInstanceOf(Action);
  });

  test("has a description", () => {
    expect(bind.description).toBe(
      `Binds a unit in the given direction (\`'${FORWARD}'\` by default) to keep them from moving.`,
    );
  });

  test("has meta for type generation", () => {
    expect(bind.meta).toEqual({
      params: [{ name: "direction", type: "Direction", optional: true }],
      returns: "void",
    });
  });

  describe("performing", () => {
    test("binds forward by default", () => {
      unit.getSpaceAt = vi.fn(() => ({ getUnit: () => null }));
      bind.perform();
      expect(unit.getSpaceAt).toHaveBeenCalledWith(FORWARD);
    });

    test("allows to specify direction", () => {
      unit.getSpaceAt = vi.fn(() => ({ getUnit: () => null }));
      bind.perform(LEFT);
      expect(unit.getSpaceAt).toHaveBeenCalledWith(LEFT);
    });

    test("misses if no receiver", () => {
      unit.getSpaceAt = () => ({ getUnit: () => null });
      bind.perform();
      expect(unit.emit).toHaveBeenCalledWith({
        type: "bind",
        description: "binds {direction} and restricts nothing",
        params: { direction: FORWARD },
      });
    });

    describe("with receiver", () => {
      let receiver: Rec;

      beforeEach(() => {
        receiver = {
          name: "receiver",
          isWarrior: () => false,
          bind: vi.fn(),
        };
        unit.getSpaceAt = () => ({ getUnit: () => receiver });
      });

      test("binds receiver", () => {
        bind.perform();
        expect(unit.emit).toHaveBeenCalledWith({
          type: "bind",
          description: "binds {direction} and restricts {target}",
          params: {
            direction: FORWARD,
            target: { type: "unit", name: "receiver", warrior: false },
          },
        });
        expect(receiver.bind).toHaveBeenCalled();
      });
    });
  });
});
