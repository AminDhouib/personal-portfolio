// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/core/src/Position.ts. Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and quoting only.

import {
  type AbsoluteDirection,
  getAbsoluteDirection,
  getAbsoluteOffset,
  getDirectionOfLocation,
  getDistanceOfLocation,
  getRelativeDirection,
  type Location,
  type RelativeDirection,
  type RelativeOffset,
  rotateRelativeOffset,
  translateLocation,
  verifyAbsoluteDirection,
} from "../spatial";
import type { Floor } from "./floor";
import type { Space } from "./space";

export class Position {
  floor: Floor;
  location: Location;
  orientation: AbsoluteDirection;

  constructor(floor: Floor, location: Location, orientation: string) {
    verifyAbsoluteDirection(orientation);
    this.floor = floor;
    this.location = location;
    this.orientation = orientation;
  }

  isAt([x, y]: Location): boolean {
    const [locationX, locationY] = this.location;
    return locationX === x && locationY === y;
  }

  getSpace(): Space {
    return this.floor.getSpaceAt(this.location);
  }

  getRelativeSpace(direction: RelativeDirection, relativeOffset: RelativeOffset): Space {
    const offset = getAbsoluteOffset(
      rotateRelativeOffset(relativeOffset, direction),
      this.orientation,
    );
    const spaceLocation = translateLocation(this.location, offset);
    return this.floor.getSpaceAt(spaceLocation);
  }

  getDistanceOf(space: Space): number {
    return getDistanceOfLocation(space.location, this.location);
  }

  getRelativeDirectionOf(space: Space): RelativeDirection {
    return getRelativeDirection(
      getDirectionOfLocation(space.location, this.location),
      this.orientation,
    );
  }

  move(direction: RelativeDirection, relativeOffset: RelativeOffset): void {
    const offset = getAbsoluteOffset(
      rotateRelativeOffset(relativeOffset, direction),
      this.orientation,
    );
    this.location = translateLocation(this.location, offset);
  }

  rotate(direction: RelativeDirection): void {
    this.orientation = getAbsoluteDirection(direction, this.orientation);
  }
}
