// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/abilities/src/Think.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { Sense } from "../core/ability";
import { Think } from "../abilities";
import { asUnit, type Rec } from "./helpers";

describe("Think", () => {
  let think: Think;
  let unit: Rec;

  beforeEach(() => {
    unit = { emit: vi.fn() };
    think = new Think(asUnit(unit));
  });

  test("is a sense", () => {
    expect(think).toBeInstanceOf(Sense);
  });

  test("has a description", () => {
    expect(think.description).toBe("Thinks out loud (`console.log` replacement).");
  });

  test("has meta for type generation", () => {
    expect(think.meta).toEqual({
      params: [{ name: "args", type: "any", rest: true }],
      returns: "void",
    });
  });

  describe("performing", () => {
    test("thinks nothing by default", () => {
      think.perform();
      expect(unit.emit).toHaveBeenCalledWith({
        type: "think",
        description: "thinks {thought}",
        params: { thought: "nothing" },
      });
    });

    test("allows to specify thought", () => {
      think.perform("he should be brave");
      expect(unit.emit).toHaveBeenCalledWith({
        type: "think",
        description: "thinks {thought}",
        params: { thought: "he should be brave" },
      });
    });

    test("allows complex thoughts, as JSON rather than util.format", () => {
      think.perform("that %o", { brave: true });
      expect(unit.emit).toHaveBeenCalledWith({
        type: "think",
        description: "thinks {thought}",
        params: { thought: 'that %o {"brave":true}' },
      });
    });
  });
});
