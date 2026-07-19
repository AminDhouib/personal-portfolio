import type { EventContext, EventDef, EventInstance } from "../types";
import { cellsToPassword, setCellStatus } from "../cells";
import { pickOne } from "../rng";

/**
 * The black hole. An anchor forms at a fixed index; every PULL_PERIOD_MS the
 * nearest still-normal cell is dragged into orbit (status "orbiting", excluded
 * from the password value). Typing the seeded "heavy word" anywhere in the value
 * collapses the singularity: after a COLLAPSE_GRACE_MS beat every captured cell
 * flips back to normal IN PLACE (orbiting is a status flip — cells never leave
 * the array, so original order is preserved). Reaching MAX_CAPTURES collapses it
 * on the same grace automatically, so an ignored black hole still resolves.
 */

const EVENT_ID = "black-hole";
const TELEGRAPH_MS = 8000;
const PULL_PERIOD_MS = 5000;
const COLLAPSE_GRACE_MS = 2000;
const MAX_CAPTURES = 6;
const HEAVY_WORDS = ["lead", "anvil", "neutron", "brick"] as const;

export interface BlackHoleData {
  anchorIndex: number; // fixed pull origin; capturing never shifts indices
  capturedIds: number[]; // cell ids dragged into orbit, in capture order
  nextPullAtMs: number; // state.elapsedMs of the next pull
  heavyWord: string; // typing this into the value triggers collapse
  collapsingSinceMs: number | null; // elapsedMs the collapse began, or null
}

/** Drag the nearest normal cell into orbit; ties resolve to the lower index. */
function pullNearest(d: BlackHoleData, ctx: EventContext): void {
  const cells = ctx.state.cells;
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]!.status !== "normal") continue;
    const dist = Math.abs(i - d.anchorIndex);
    if (dist < bestDist) {
      // strict < keeps the earlier (lower) index on an equidistant tie
      bestDist = dist;
      best = i;
    }
  }
  if (best < 0) return; // nothing left to pull
  const cell = cells[best]!;
  ctx.state.cells = setCellStatus(cells, cell.id, "orbiting", EVENT_ID);
  d.capturedIds.push(cell.id);
  ctx.state.stats.lettersAbducted++;
}

/** Rain every captured cell back into place, resolve, and announce it. */
function collapse(d: BlackHoleData, ctx: EventContext, inst: EventInstance<BlackHoleData>): void {
  let cells = ctx.state.cells;
  let count = 0;
  for (const cell of cells) {
    if (cell.status === "orbiting" && cell.eventTag === EVENT_ID) {
      cells = setCellStatus(cells, cell.id, "normal");
      count++;
    }
  }
  ctx.state.cells = cells;
  ctx.state.stats.lettersRescued += count;
  inst.phase = "done";
  ctx.emit({
    kind: "toast",
    tone: "success",
    text: "The singularity collapses. Letters rain back.",
  });
}

export const blackHoleDef: EventDef<BlackHoleData> = {
  id: EVENT_ID,
  family: "force",
  telegraphMs: TELEGRAPH_MS,
  init: (rng, state) => {
    const roll = rng();
    return {
      anchorIndex: state.cells.length === 0 ? 0 : Math.floor(roll * state.cells.length),
      capturedIds: [],
      nextPullAtMs: 0,
      heavyWord: pickOne(rng, HEAVY_WORDS),
      collapsingSinceMs: null,
    };
  },
  onTick(inst: EventInstance<BlackHoleData>, ctx: EventContext): void {
    const d = inst.data;
    if (inst.phase === "telegraph") {
      if (inst.phaseElapsedMs >= TELEGRAPH_MS) {
        inst.phase = "onset";
        d.nextPullAtMs = ctx.state.elapsedMs + PULL_PERIOD_MS;
        ctx.emit({ kind: "sound", sound: "force-onset" });
      }
      return;
    }
    if (inst.phase === "onset") inst.phase = "peak";

    if (d.collapsingSinceMs !== null) {
      if (ctx.state.elapsedMs - d.collapsingSinceMs >= COLLAPSE_GRACE_MS) collapse(d, ctx, inst);
      return;
    }

    while (ctx.state.elapsedMs >= d.nextPullAtMs && d.collapsingSinceMs === null) {
      pullNearest(d, ctx);
      d.nextPullAtMs += PULL_PERIOD_MS;
      if (d.capturedIds.length >= MAX_CAPTURES) d.collapsingSinceMs = ctx.state.elapsedMs;
    }
    if (d.collapsingSinceMs === null && cellsToPassword(ctx.state.cells).includes(d.heavyWord)) {
      d.collapsingSinceMs = ctx.state.elapsedMs;
    }
  },
  isResolved: (inst) => inst.phase === "done",
};
