import type { CharCell, EventContext, EventDef, EventInstance } from "../types";

/**
 * The parasite. A silent telegraph, then a mimic cell is spliced in — its glyph
 * cloned from the neighbour at the insertion point, so it hides in plain sight.
 * Parasite cells are excluded from the password value (see cells.ts): the player
 * SEES the glyph but every length/sum rule reads one short. That is the whole
 * evil — the only tell is a faint periodic wiggle. Click it to evict it; if left
 * alone past SECOND_PARASITE_AFTER_MS a second one spawns (capped at two).
 */

const EVENT_ID = "parasite";
const TELEGRAPH_MS = 4000;
const WIGGLE_PERIOD_MS = 6000;
const SECOND_PARASITE_AFTER_MS = 90_000;
const MAX_PARASITES = 2;

export interface ParasiteData {
  parasiteIds: number[]; // live mimic cell ids
  spawnedSecondAtMs: number | null; // elapsedMs the second mimic spawned, or null
}

/** Splice one mimic cell at a random index, cloning the glyph there ("x" if empty). */
function insertParasite(d: ParasiteData, ctx: EventContext): void {
  const cells = ctx.state.cells;
  const len = cells.length;
  const index = Math.floor(ctx.rng() * (len + 1)); // 0..len inclusive
  const ref = len === 0 ? null : (cells[index] ?? cells[len - 1]!);
  const glyph = ref ? ref.ch : "x";
  const id = ctx.state.nextCellId++;
  const parasite: CharCell = { id, ch: glyph, status: "parasite", eventTag: EVENT_ID };
  ctx.state.cells = [...cells.slice(0, index), parasite, ...cells.slice(index)];
  d.parasiteIds.push(id);
}

/** Emit the wiggle cue once per WIGGLE_PERIOD_MS boundary crossed this tick. */
function wiggleIfDue(inst: EventInstance<ParasiteData>, ctx: EventContext): void {
  const prev = inst.phaseElapsedMs - ctx.dtMs;
  if (Math.floor(inst.phaseElapsedMs / WIGGLE_PERIOD_MS) > Math.floor(prev / WIGGLE_PERIOD_MS)) {
    ctx.emit({ kind: "sound", sound: "parasite-wiggle" });
  }
}

/** After the grace window, spawn the second mimic once (never a third). */
function maybeSpawnSecond(
  d: ParasiteData,
  ctx: EventContext,
  inst: EventInstance<ParasiteData>,
): void {
  if (d.spawnedSecondAtMs !== null) return;
  if (inst.phaseElapsedMs < SECOND_PARASITE_AFTER_MS) return;
  if (d.parasiteIds.length >= MAX_PARASITES) return;
  insertParasite(d, ctx);
  d.spawnedSecondAtMs = ctx.state.elapsedMs;
}

export const parasiteDef: EventDef<ParasiteData> = {
  id: EVENT_ID,
  family: "force",
  telegraphMs: TELEGRAPH_MS,
  init: () => ({ parasiteIds: [], spawnedSecondAtMs: null }),
  onTick(inst: EventInstance<ParasiteData>, ctx: EventContext): void {
    const d = inst.data;
    if (inst.phase === "telegraph") {
      if (inst.phaseElapsedMs >= TELEGRAPH_MS) {
        inst.phase = "onset";
        insertParasite(d, ctx); // silent — the telegraph is the subtle wiggle
      }
      return;
    }
    if (inst.phase === "onset") {
      inst.phase = "peak"; // settle a frame so the wiggle clock starts clean
      return;
    }
    // A mimic removed by anything but our own click still resolves us.
    d.parasiteIds = d.parasiteIds.filter((id) =>
      ctx.state.cells.some((c) => c.id === id && c.status === "parasite"),
    );
    if (d.parasiteIds.length === 0) {
      inst.phase = "done";
      return;
    }
    wiggleIfDue(inst, ctx);
    maybeSpawnSecond(d, ctx, inst);
  },
  onPointer(inst: EventInstance<ParasiteData>, ctx: EventContext, target): boolean {
    if (target.kind !== "parasite") return false;
    const id = typeof target.id === "number" ? target.id : -1;
    const idx = ctx.state.cells.findIndex(
      (c) => c.id === id && c.status === "parasite" && c.eventTag === EVENT_ID,
    );
    if (idx < 0) return false;
    ctx.state.cells = [...ctx.state.cells.slice(0, idx), ...ctx.state.cells.slice(idx + 1)];
    const d = inst.data;
    d.parasiteIds = d.parasiteIds.filter((pid) => pid !== id);
    if (d.parasiteIds.length === 0) inst.phase = "done";
    return true;
  },
  isResolved: (inst) => inst.phase === "done",
};
