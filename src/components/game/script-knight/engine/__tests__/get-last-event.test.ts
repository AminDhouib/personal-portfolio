// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/scoring/src/getLastEvent.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { expect, test } from "vitest";
import { getLastEvent, type ScoringEvent } from "../scoring";

const event = (score: number): ScoringEvent => ({
  warriorStatus: { score },
  floorMap: [[{ unit: undefined }]],
});

test("returns the last event of the play", () => {
  const turns = [[event(1)], [event(2)], [event(3), event(4), event(5)]];
  expect(getLastEvent(turns)).toBe(turns[2]?.[2]);
});
