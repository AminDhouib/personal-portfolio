// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/core/src/getLevelConfig.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { expect, test } from "vitest";
import { getLevelConfig } from "../core/level-config";

const tower = {
  name: "Foo",
  description: "A test tower",
  warrior: {
    maxHealth: 20,
  },
  levels: [
    {
      floor: {
        warrior: {
          abilities: { a: 1 },
          position: { x: 0, y: 0, facing: "east" },
        },
        size: { width: 1, height: 1 },
        stairs: { x: 0, y: 0 },
        units: [],
      },
    },
    {
      floor: {
        warrior: {
          abilities: { b: 2, c: 3 },
          position: { x: 0, y: 0, facing: "east" },
        },
        size: { width: 1, height: 1 },
        stairs: { x: 0, y: 0 },
        units: [],
      },
    },
    {
      floor: {
        warrior: { position: { x: 0, y: 0, facing: "east" } },
        size: { width: 1, height: 1 },
        stairs: { x: 0, y: 0 },
        units: [],
      },
    },
    {
      floor: {
        warrior: {
          abilities: { a: 4 },
          position: { x: 0, y: 0, facing: "east" },
        },
        size: { width: 1, height: 1 },
        stairs: { x: 0, y: 0 },
        units: [],
      },
    },
  ],
};

test("merges tower warrior with level warrior", () => {
  const config = getLevelConfig(tower as never, 1, "Aldric", false);
  expect(config).not.toBeNull();
  expect(config!.floor.warrior).toEqual({
    maxHealth: 20,
    name: "Aldric",
    abilities: { a: 1 },
    position: { x: 0, y: 0, facing: "east" },
  });
});

test("accumulates abilities from all levels if epic", () => {
  const config = getLevelConfig(tower as never, 1, "Aldric", true);
  expect(config!.floor.warrior.abilities).toEqual({ a: 4, b: 2, c: 3 });
});

test("accumulates abilities up to current level", () => {
  const config = getLevelConfig(tower as never, 2, "Aldric", false);
  expect(config!.floor.warrior.abilities).toEqual({ a: 1, b: 2, c: 3 });
});

test("returns null for non-existent level", () => {
  expect(getLevelConfig(tower as never, 5, "Aldric", false)).toBeNull();
});

test("does not mutate original tower config", () => {
  const config = getLevelConfig(tower as never, 1, "Aldric", false);
  if (config) config.floor.warrior.name = "Modified";
  expect(tower.warrior).not.toHaveProperty("name");
  expect(tower.levels[0]?.floor.warrior).not.toHaveProperty("name");
});

test("handles class references in abilities and units", () => {
  class FakeAbility {}
  class FakeUnit {}
  const towerWithClasses = {
    name: "Bar",
    description: "A tower with classes",
    warrior: { maxHealth: 20 },
    levels: [
      {
        floor: {
          warrior: {
            abilities: { walk: FakeAbility },
            position: { x: 0, y: 0, facing: "east" },
          },
          size: { width: 3, height: 1 },
          stairs: { x: 2, y: 0 },
          units: [
            {
              unit: FakeUnit,
              position: { x: 1, y: 0, facing: "west" },
            },
          ],
        },
      },
    ],
  } as never;
  const config = getLevelConfig(towerWithClasses, 1, "Aldric", false);
  expect(config).not.toBeNull();
  expect(config?.floor.warrior.abilities?.walk).toBe(FakeAbility);
  expect(config?.floor.units?.[0]?.unit).toBe(FakeUnit);
});
