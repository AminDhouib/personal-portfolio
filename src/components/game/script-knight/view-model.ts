import type { FloorSpace } from "./engine/core/floor";
import { loadLevel } from "./engine/core/level";
import type { LevelConfig } from "./engine/core/level-config";
import type { TurnEvent } from "./engine/core/logger";
import { Ticking } from "./engine/effects";
import {
  type AbsoluteDirection,
  getAbsoluteDirection,
  getAbsoluteOffset,
  RELATIVE_DIRECTIONS,
  type RelativeDirection,
  rotateRelativeOffset,
} from "./engine/spatial";

// What the floor view draws. The engine's event snapshots say who stands where, but not how
// healthy, which way they face, who is chained or how long a bomb has left, so this module keeps
// that alongside: it starts from the level config and folds each event in. Pure data.

export interface FrameUnit {
  id: number;
  name: string;
  warrior: boolean;
  /** Inner floor coordinates (the wall ring is not counted). */
  x: number;
  y: number;
  facing: AbsoluteDirection;
  health: number;
  maxHealth: number;
  bound: boolean;
  /** Turns left on a ticking explosive, or null when the unit has none. */
  ticking: number | null;
}

export interface FloorFrame {
  width: number;
  height: number;
  stairs: { x: number; y: number };
  units: FrameUnit[];
}

interface Tracked {
  facing: AbsoluteDirection;
  health: number;
  bound: boolean;
  ticking: number | null;
}

/** Per unit id, the facts a snapshot leaves out. */
export type UnitState = ReadonlyMap<number, Tracked>;

/** The starting facts of every unit, read from a freshly loaded level (ids are floor indices). */
export function startState(config: LevelConfig): UnitState {
  const { floor } = loadLevel(config);
  const state = new Map<number, Tracked>();
  floor.units.forEach((unit, id) => {
    const effect = unit.effects.get("ticking");
    state.set(id, {
      facing: unit.position?.orientation ?? "east",
      health: unit.health,
      bound: unit.isBound(),
      ticking: effect instanceof Ticking ? effect.time : null,
    });
  });
  return state;
}

function isRelativeDirection(value: unknown): value is RelativeDirection {
  return RELATIVE_DIRECTIONS.some((direction) => direction === value);
}

/** Where each unit stands in a snapshot, keyed by id, in inner coordinates. */
function positionsOf(map: FloorSpace[][]): Map<number, { x: number; y: number }> {
  const positions = new Map<number, { x: number; y: number }>();
  map.forEach((row, rowIndex) =>
    row.forEach((space, columnIndex) => {
      if (space.unit) positions.set(space.unit.id, { x: columnIndex - 1, y: rowIndex - 1 });
    }),
  );
  return positions;
}

/** Folds one event into the tracked facts. Returns a new state; the old one is untouched. */
export function applyEvent(state: UnitState, event: TurnEvent): UnitState {
  const actorId = event.actor?.id;
  if (actorId === undefined) return state;
  const actor = state.get(actorId);
  if (!actor) return state;
  const { type, params } = event.action;
  const next = new Map(state);

  switch (type) {
    case "takeDamage":
    case "heal":
      if (typeof params.remainingHp === "number") {
        next.set(actorId, { ...actor, health: params.remainingHp });
      }
      break;
    case "pivot":
      if (isRelativeDirection(params.direction)) {
        next.set(actorId, {
          ...actor,
          facing: getAbsoluteDirection(params.direction, actor.facing),
        });
      }
      break;
    case "release":
      next.set(actorId, { ...actor, bound: false });
      break;
    case "tick":
      if (actor.ticking !== null) next.set(actorId, { ...actor, ticking: actor.ticking - 1 });
      break;
    case "bind": {
      // A bind with a target names no id, so find who stands in the space it was aimed at.
      if (params.target === undefined || !isRelativeDirection(params.direction)) break;
      const positions = positionsOf(event.floorMap);
      const from = positions.get(actorId);
      if (!from) break;
      const [dx, dy] = getAbsoluteOffset(
        rotateRelativeOffset([1, 0], params.direction),
        actor.facing,
      );
      for (const [id, at] of positions) {
        const target = next.get(id);
        if (target && at.x === from.x + dx && at.y === from.y + dy) {
          next.set(id, { ...target, bound: true });
        }
      }
      break;
    }
    default:
      break;
  }
  return next;
}

/** The floor to draw: positions from the snapshot, everything else from the tracked state. */
export function floorFrame(state: UnitState, map: FloorSpace[][]): FloorFrame {
  const height = Math.max(0, map.length - 2);
  const width = Math.max(0, (map[0]?.length ?? 0) - 2);
  let stairs = { x: 0, y: 0 };
  const units: FrameUnit[] = [];
  map.forEach((row, rowIndex) =>
    row.forEach((space, columnIndex) => {
      const x = columnIndex - 1;
      const y = rowIndex - 1;
      if (space.stairs && !space.wall) stairs = { x, y };
      if (!space.unit) return;
      const tracked = state.get(space.unit.id);
      units.push({
        id: space.unit.id,
        name: space.unit.name,
        warrior: space.unit.warrior === true,
        x,
        y,
        facing: tracked?.facing ?? "east",
        health: tracked?.health ?? space.unit.maxHealth,
        maxHealth: space.unit.maxHealth,
        bound: tracked?.bound ?? false,
        ticking: tracked?.ticking ?? null,
      });
    }),
  );
  return { width, height, stairs, units };
}
