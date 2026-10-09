// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/scoring/src/getRemainingTimeBonus.test.ts. Copyright (c) 2015-present Matias Olivera.
// MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: the sibling modules are merged, so the upstream vi.mock stub of
// getTurnCount is replaced by real turn data.

import { expect, test } from "vitest";

import { getRemainingTimeBonus, type ScoringEvent } from "../scoring";

function turnsOf(count: number): ScoringEvent[][] {
  return Array.from({ length: count }, () => [{ floorMap: [[]] }]);
}

test("subtracts the number of turns played from the initial time bonus", () => {
  expect(getRemainingTimeBonus(turnsOf(3), 10)).toBe(7);
});

test("doesn't go below zero", () => {
  expect(getRemainingTimeBonus(turnsOf(11), 10)).toBe(0);
});
