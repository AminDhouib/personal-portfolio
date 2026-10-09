// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/scoring/src/getWarriorScore.test.ts. Copyright (c) 2015-present Matias Olivera.
// MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: the sibling modules are merged, so the upstream vi.mock stub of
// getLastEvent is replaced by real turn data.

import { expect, test } from "vitest";

import { getWarriorScore, type ScoringEvent } from "../scoring";

test("returns the score of the warrior at the end of the play", () => {
  const turns: ScoringEvent[][] = [
    [{ warriorStatus: { score: 7 }, floorMap: [[]] }],
    [{ floorMap: [[]] }, { warriorStatus: { score: 42 }, floorMap: [[]] }],
  ];
  expect(getWarriorScore(turns)).toBe(42);
});

test("throws when the last event has no warrior status", () => {
  expect(() => getWarriorScore([[{ floorMap: [[]] }]])).toThrow(
    "Last event has no warrior status.",
  );
});
