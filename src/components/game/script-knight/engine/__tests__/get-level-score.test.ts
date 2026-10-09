// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/scoring/src/getLevelScore.test.ts. Copyright (c) 2015-present Matias Olivera.
// MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: the sibling modules are merged, so the upstream vi.mock stubs
// are replaced by real turn data.

import { describe, expect, test } from "vitest";

import { getLevelScore, type ScoringEvent } from "../scoring";

const levelConfig = { timeBonus: 16 };

function event(score: number, units: number): ScoringEvent {
  return {
    warriorStatus: { score },
    floorMap: [Array.from({ length: units }, () => ({ unit: {} }))],
  };
}

test("returns null when level failed", () => {
  expect(getLevelScore({ passed: false, turns: [] }, levelConfig)).toBeNull();
});

describe("level passed", () => {
  // Four turns, the warrior ends with 8 points and the floor holds only the warrior.
  const turns: ScoringEvent[][] = [[event(0, 3)], [event(5, 2)], [event(8, 2)], [event(8, 1)]];

  test("has warrior score part", () => {
    expect(getLevelScore({ passed: true, turns }, levelConfig)?.warrior).toBe(8);
  });

  test("has time bonus part", () => {
    expect(getLevelScore({ passed: true, turns }, levelConfig)?.timeBonus).toBe(12);
  });

  test("has clear bonus part", () => {
    expect(getLevelScore({ passed: true, turns }, levelConfig)?.clearBonus).toBe(4);
  });

  test("has no clear bonus when other units remain", () => {
    const uncleared = [...turns.slice(0, 3), [event(8, 2)]];
    expect(getLevelScore({ passed: true, turns: uncleared }, levelConfig)?.clearBonus).toBe(0);
  });
});
