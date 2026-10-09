// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/scoring/src/getTurnCount.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { expect, test } from "vitest";
import { getTurnCount, type ScoringEvent } from "../scoring";

const event: ScoringEvent = { floorMap: [[]] };

test("returns the number of turns played", () => {
  const turns = [[event], [event], [event]];
  expect(getTurnCount(turns)).toBe(3);
});
