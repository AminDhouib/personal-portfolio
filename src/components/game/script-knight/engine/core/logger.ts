// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/core/src/{Logger,GameAction}.ts. Copyright (c) 2015-present Matias Olivera. MIT licence:
// see ../LICENSE. Modified by Amin Dhouib, 2026: one Logger per level, not a module singleton.

import type { Floor, FloorSpace } from "./floor";
import type { Unit } from "./unit";

export interface GameAction {
  type: string;
  description: string;
  params: Record<string, unknown>;
}

export interface TurnEvent {
  action: GameAction;
  actor: { id: number; name: string; warrior: boolean } | null;
  floorMap: FloorSpace[][];
  warriorStatus: { health: number; score: number } | undefined;
}

export class Logger {
  turns: TurnEvent[][] = [];
  lastTurn: TurnEvent[] | null = null;
  initialState: TurnEvent;

  constructor(private readonly floor: Floor) {
    this.initialState = {
      action: { type: "init", description: "", params: {} },
      actor: null,
      floorMap: floor.getSnapshot(),
      warriorStatus: floor.warrior?.getStatus(),
    };
  }

  turn(): void {
    this.lastTurn = [];
    this.turns.push(this.lastTurn);
  }

  unit(unit: Unit, action: GameAction): void {
    this.lastTurn?.push({
      action,
      actor: {
        id: this.floor.units.indexOf(unit),
        name: unit.name,
        warrior: unit === this.floor.warrior,
      },
      floorMap: this.floor.getSnapshot(),
      warriorStatus: this.floor.warrior?.getStatus(),
    });
  }
}
