// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/core/src/Floor.ts. Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: units remember their floor, and the floor hands out its logger.

import type { Location } from "../spatial";
import type { Logger } from "./logger";
import { Position } from "./position";
import { Space } from "./space";
import type { PositionConfig } from "./level-config";
import type { Unit } from "./unit";
import type { Warrior } from "./warrior";

export interface FloorSpace {
  wall?: boolean;
  stairs?: boolean;
  unit?: {
    id: number;
    name: string;
    maxHealth: number;
    warrior?: boolean;
  };
}

export class Floor {
  width: number;
  height: number;
  stairsLocation: Location;
  units: Unit[];
  warrior: Warrior | null;
  logger: Logger | null = null;

  constructor(width: number, height: number, stairsLocation: Location) {
    this.width = width;
    this.height = height;
    this.stairsLocation = stairsLocation;
    this.units = [];
    this.warrior = null;
  }

  getMap(): Space[][] {
    const map: Space[][] = [];
    for (let y = -1; y < this.height + 1; y += 1) {
      const row: Space[] = [];
      for (let x = -1; x < this.width + 1; x += 1) {
        row.push(this.getSpaceAt([x, y]));
      }
      map.push(row);
    }
    return map;
  }

  /** The map as plain data (wall ring included), for the event log. */
  getSnapshot(): FloorSpace[][] {
    return this.getMap().map((row) => row.map((space) => space.toJSON()));
  }

  isOutOfBounds([x, y]: Location): boolean {
    return x < 0 || y < 0 || x > this.width - 1 || y > this.height - 1;
  }

  isStairs([x, y]: Location): boolean {
    const [stairsX, stairsY] = this.stairsLocation;
    return x === stairsX && y === stairsY;
  }

  getStairsSpace(): Space {
    return this.getSpaceAt(this.stairsLocation);
  }

  getSpaceAt(location: Location): Space {
    return new Space(this, location);
  }

  addWarrior(warrior: Warrior, position: PositionConfig): void {
    this.addUnit(warrior, position);
    this.warrior = warrior;
  }

  addUnit(unit: Unit, { x, y, facing }: PositionConfig): void {
    const unitWithPosition = unit;
    const location: Location = [x, y];
    unitWithPosition.position = new Position(this, location, facing);
    unitWithPosition.floor = this;
    this.units.push(unitWithPosition);
  }

  getUnitAt(location: Location): Unit | undefined {
    return this.getUnits().find((unit) => unit.position?.isAt(location));
  }

  getUnits(): Unit[] {
    return this.units.filter((unit) => unit.isAlive());
  }
}
