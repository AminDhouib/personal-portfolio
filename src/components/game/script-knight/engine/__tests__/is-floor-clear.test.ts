// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/scoring/src/isFloorClear.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { expect, test } from "vitest";
import { isFloorClear } from "../scoring";

test("considers clear when there are no units other than the warrior", () => {
  const floorMap = [
    [{}, {}],
    [{ unit: "warrior" }, {}],
  ];
  expect(isFloorClear(floorMap)).toBe(true);
});

test("doesn't consider clear when there are other units apart from the warrior", () => {
  const floorMap = [
    [{}, {}],
    [{ unit: "warrior" }, { unit: "foo" }],
  ];
  expect(isFloorClear(floorMap)).toBe(false);
});
