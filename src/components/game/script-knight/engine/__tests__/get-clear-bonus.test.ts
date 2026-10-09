// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/scoring/src/getClearBonus.test.ts. Copyright (c) 2015-present Matias Olivera.
// MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: the sibling modules are merged, so the upstream vi.mock stubs
// are replaced by real turn data.

import { expect, test } from "vitest";

import { getClearBonus, type ScoringEvent } from "../scoring";

const warrior = { unit: { name: "Aldric" } };
const sludge = { unit: { name: "Sludge" } };

function turnsEndingWith(floorMap: ScoringEvent["floorMap"]): ScoringEvent[][] {
  return [[{ floorMap: [[{}]] }], [{ floorMap }]];
}

test("returns the 20% of the sum of the warrior score and the time bonus with clear level", () => {
  expect(getClearBonus(turnsEndingWith([[warrior, {}]]), 3, 2)).toBe(1);
});

test("returns zero if the level is not clear", () => {
  expect(getClearBonus(turnsEndingWith([[warrior, sludge]]), 3, 2)).toBe(0);
});

test("reads the last event of the last turn", () => {
  const turns: ScoringEvent[][] = [
    [{ floorMap: [[warrior, sludge]] }],
    [{ floorMap: [[warrior]] }],
  ];
  expect(getClearBonus(turns, 10, 5)).toBe(3);
});
