import type { CharCell, EventContext, EventDef, EventInstance } from "../types";

/**
 * Tetris garbage. Ten junk blocks fall on a DROP_PERIOD_MS cadence; each lands
 * LAND_DELAY_MS after it starts, wedging a new "garbage" cell into the box at a
 * seeded index (clamped to the live length at land time). Unlike every other
 * intruder, garbage COUNTS in the password value — it inflates the length and warps
 * the digit sum, which is the whole hazard. Backspace clears it natively; clicking a
 * garbage cell shatters it. The event resolves once all ten have landed and no
 * garbage remains. No coupled rule.
 */

const EVENT_ID = "tetris";
const TELEGRAPH_MS = 6000;
const DROP_PERIOD_MS = 4000;
const LAND_DELAY_MS = 2500;
const DROP_COUNT = 10;
const DROP_CHARS = ["#", "%", "&"] as const;

interface Drop {
  char: string;
  targetIndex: number; // seeded slot; clamped to the live length when it lands
  startAtMs: number; // state.elapsedMs the block began falling
  landed: boolean;
}

export interface TetrisData {
  drops: Drop[];
  spawned: number; // blocks that have landed in the box
}

/** Schedule all ten blocks at onset: seeded slots and staggered start times. */
function scheduleDrops(d: TetrisData, ctx: EventContext): void {
  const onset = ctx.state.elapsedMs;
  const len = ctx.state.cells.length;
  for (let k = 0; k < DROP_COUNT; k++) {
    d.drops.push({
      char: DROP_CHARS[k % DROP_CHARS.length]!,
      targetIndex: Math.floor(ctx.rng() * (len + 1)),
      startAtMs: onset + k * DROP_PERIOD_MS,
      landed: false,
    });
  }
}

/** True once every scheduled block has landed. */
function allLanded(d: TetrisData): boolean {
  return d.drops.length >= DROP_COUNT && d.drops.every((x) => x.landed);
}

/** Any live garbage still in the box. */
function garbageRemains(ctx: EventContext): boolean {
  return ctx.state.cells.some((c) => c.status === "garbage" && c.eventTag === EVENT_ID);
}

export const tetrisDef: EventDef<TetrisData> = {
  id: EVENT_ID,
  family: "invasion",
  telegraphMs: TELEGRAPH_MS,
  init: () => ({ drops: [], spawned: 0 }),
  onTick(inst: EventInstance<TetrisData>, ctx: EventContext): void {
    const d = inst.data;
    if (inst.phase === "telegraph") {
      if (inst.phaseElapsedMs <= ctx.dtMs) ctx.emit({ kind: "sound", sound: "telegraph-doom" });
      if (inst.phaseElapsedMs >= TELEGRAPH_MS) {
        inst.phase = "onset";
        scheduleDrops(d, ctx);
        ctx.emit({ kind: "sound", sound: "invasion-onset" });
      }
      return;
    }
    if (inst.phase === "onset") inst.phase = "peak";

    let cells = ctx.state.cells;
    for (const drop of d.drops) {
      if (drop.landed) continue;
      if (ctx.state.elapsedMs < drop.startAtMs + LAND_DELAY_MS) continue;
      const at = Math.min(drop.targetIndex, cells.length);
      const cell: CharCell = {
        id: ctx.state.nextCellId++,
        ch: drop.char,
        status: "garbage",
        eventTag: EVENT_ID,
      };
      cells = [...cells.slice(0, at), cell, ...cells.slice(at)];
      if (at <= ctx.state.caret) ctx.state.caret++;
      drop.landed = true;
      d.spawned++;
    }
    ctx.state.cells = cells;

    if (allLanded(d) && !garbageRemains(ctx)) inst.phase = "done";
  },
  onPointer(inst: EventInstance<TetrisData>, ctx: EventContext, target): boolean {
    if (target.kind !== "cell") return false;
    const id = typeof target.id === "number" ? target.id : -1;
    const idx = ctx.state.cells.findIndex(
      (c) => c.id === id && c.status === "garbage" && c.eventTag === EVENT_ID,
    );
    if (idx < 0) return false; // a normal cell: not consumed, falls through to caret placement
    ctx.state.cells = [...ctx.state.cells.slice(0, idx), ...ctx.state.cells.slice(idx + 1)];
    if (idx < ctx.state.caret) ctx.state.caret--;
    ctx.state.stats.garbageCleared++;
    return true;
  },
  isResolved: (inst) => inst.phase === "done",
};
