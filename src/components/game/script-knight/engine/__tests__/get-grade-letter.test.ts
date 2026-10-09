// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/scoring/src/getGradeLetter.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { expect, test } from "vitest";
import { getGradeLetter } from "../scoring";

test("returns letter based on grade", () => {
  expect(getGradeLetter(1.0)).toBe("S");
  expect(getGradeLetter(0.99)).toBe("A");
  expect(getGradeLetter(0.9)).toBe("A");
  expect(getGradeLetter(0.89)).toBe("B");
  expect(getGradeLetter(0.8)).toBe("B");
  expect(getGradeLetter(0.79)).toBe("C");
  expect(getGradeLetter(0.7)).toBe("C");
  expect(getGradeLetter(0.69)).toBe("D");
  expect(getGradeLetter(0.6)).toBe("D");
  expect(getGradeLetter(0.59)).toBe("F");
  expect(getGradeLetter(0)).toBe("F");
});
