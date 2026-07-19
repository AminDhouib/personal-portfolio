import type { EventContext, EventDef, EventInstance, Pg2RuleDef } from "../types";
import { setCellStatus } from "../cells";

/**
 * Galaga — the marquee invasion. Three waves of a fixed alien formation descend on
 * the box. Every DIVE_PERIOD_MS the next formation alien peels off and dives; a beat
 * later it grabs the letter nearest the box centre and hauls it into orbit (status
 * "abducted", excluded from the value). Type that letter to shoot the alien down and
 * rain the letter back; click a formation/diving alien to shoot it before it grabs.
 * A wave ends when every alien is down (straight to the next wave) or when its 45s
 * cap elapses (a tractor malfunction rains the carried letters back, the survivors
 * FLEE rather than die, and the next wave begins). After wave three the fleet is
 * gone. The coupled rule wants the FINAL wave shot down to the last invader — a
 * timed-out third wave leaves fled aliens and fails it.
 */

const EVENT_ID = "galaga";
const TELEGRAPH_MS = 10_000;
const DIVE_PERIOD_MS = 4000;
const GRAB_DELAY_MS = 2000;
const WAVE_CAP_MS = 45_000;
const WAVE_SIZES = [12, 8, 6] as const;

/** One invader. Positions are painter-derived from these fields + timestamps. */
export interface Alien {
  id: number; // unique within the run; fresh ids per wave
  formationIndex: number; // slot in the descending formation; dive order
  state: "formation" | "diving" | "carrying" | "down" | "fled";
  carriedCellId: number | null; // the abducted cell, while carrying
  diveStartedAtMs: number | null; // state.elapsedMs the dive began, or null
}

export interface GalagaData {
  wave: 1 | 2 | 3;
  aliens: Alien[];
  waveStartedAtMs: number; // state.elapsedMs the current wave spawned
  nextDiveAtMs: number; // state.elapsedMs the next alien peels off
  timedOutWaves: number; // waves that hit their 45s cap
}

/** Spawn a fresh formation for the current wave and arm its first dive. */
function spawnWave(d: GalagaData, ctx: EventContext): void {
  const size = WAVE_SIZES[d.wave - 1] ?? 0;
  d.aliens = Array.from({ length: size }, (_unused, i) => ({
    id: d.wave * 1000 + i,
    formationIndex: i,
    state: "formation" as const,
    carriedCellId: null,
    diveStartedAtMs: null,
  }));
  d.waveStartedAtMs = ctx.state.elapsedMs;
  d.nextDiveAtMs = ctx.state.elapsedMs + DIVE_PERIOD_MS;
}

/** Advance to the next wave, or end the invasion after the third. */
function advanceWave(d: GalagaData, ctx: EventContext, inst: EventInstance<GalagaData>): void {
  if (d.wave >= 3) {
    inst.phase = "done";
    return;
  }
  d.wave = (d.wave + 1) as 1 | 2 | 3;
  spawnWave(d, ctx);
  ctx.emit({ kind: "sound", sound: "invasion-onset" });
}

/** Next wave the instant every alien is down (shot, not fled). */
function maybeAdvanceWave(d: GalagaData, ctx: EventContext, inst: EventInstance<GalagaData>): void {
  if (d.aliens.length > 0 && d.aliens.every((a) => a.state === "down")) {
    advanceWave(d, ctx, inst);
  }
}

/** The wave outlived its cap: rain carried letters back, survivors flee, next wave. */
function timeoutWave(d: GalagaData, ctx: EventContext, inst: EventInstance<GalagaData>): void {
  let cells = ctx.state.cells;
  for (const a of d.aliens) {
    if (a.state === "carrying" && a.carriedCellId !== null) {
      cells = setCellStatus(cells, a.carriedCellId, "normal");
    }
  }
  ctx.state.cells = cells;
  for (const a of d.aliens) {
    if (a.state === "carrying" || a.state === "diving" || a.state === "formation") {
      a.state = "fled";
      a.carriedCellId = null;
      a.diveStartedAtMs = null;
    }
  }
  d.timedOutWaves += 1;
  ctx.emit({ kind: "toast", tone: "info", text: "Tractor malfunction. Your letters rain back." });
  advanceWave(d, ctx, inst);
}

/** One wave's peak logic: cap check, launch due dives, resolve grabs, close the wave. */
function runWave(d: GalagaData, ctx: EventContext, inst: EventInstance<GalagaData>): void {
  if (ctx.state.elapsedMs - d.waveStartedAtMs >= WAVE_CAP_MS) {
    timeoutWave(d, ctx, inst);
    return;
  }

  while (ctx.state.elapsedMs >= d.nextDiveAtMs) {
    const next = d.aliens
      .filter((a) => a.state === "formation")
      .sort((a, b) => a.formationIndex - b.formationIndex)[0];
    if (next) {
      next.state = "diving";
      next.diveStartedAtMs = ctx.state.elapsedMs;
    }
    d.nextDiveAtMs += DIVE_PERIOD_MS;
  }

  let cells = ctx.state.cells;
  for (const a of d.aliens) {
    if (a.state !== "diving" || a.diveStartedAtMs === null) continue;
    if (ctx.state.elapsedMs - a.diveStartedAtMs < GRAB_DELAY_MS) continue;
    const centre = Math.floor(cells.length / 2);
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i]!.status !== "normal") continue;
      const dist = Math.abs(i - centre);
      if (dist < bestDist) {
        // strict < keeps the earlier (lower) index on an equidistant tie
        bestDist = dist;
        best = i;
      }
    }
    if (best < 0) {
      a.state = "formation"; // nothing to grab: rejoin the formation
      a.diveStartedAtMs = null;
    } else {
      const cell = cells[best]!;
      cells = setCellStatus(cells, cell.id, "abducted", EVENT_ID);
      a.state = "carrying";
      a.carriedCellId = cell.id;
      a.diveStartedAtMs = null;
      ctx.state.stats.lettersAbducted++;
    }
  }
  ctx.state.cells = cells;
  maybeAdvanceWave(d, ctx, inst);
}

/** Coupled rule: the final wave must be shot down to the last invader. */
const galagaFinalWaveRule: Pg2RuleDef = {
  id: "galaga-final-wave",
  act: "act3",
  create: () => ({
    id: "galaga-final-wave",
    act: "act3",
    description: "Every invader in the final wave must be shot down.",
    validate: (_password, _state, api) => {
      const d = api.getEventData<GalagaData>("galaga");
      if (d === null) return { passed: true }; // no fleet this run: a freebie
      const done = api.isEventDone("galaga");
      if (d.wave < 3 || !done) {
        const size = WAVE_SIZES[d.wave - 1] ?? 0;
        const down = d.aliens.filter((a) => a.state === "down").length;
        return { passed: false, message: `Wave ${d.wave} incoming - ${down} of ${size} down` };
      }
      const allDown = d.aliens.length > 0 && d.aliens.every((a) => a.state === "down");
      return {
        passed: allDown,
        message: allDown ? undefined : "The fleet escaped with your letters",
      };
    },
  }),
};

export const galagaDef: EventDef<GalagaData> = {
  id: EVENT_ID,
  family: "invasion",
  telegraphMs: TELEGRAPH_MS,
  coupledRule: galagaFinalWaveRule,
  init: () => ({
    wave: 1,
    aliens: [],
    waveStartedAtMs: 0,
    nextDiveAtMs: 0,
    timedOutWaves: 0,
  }),
  onTick(inst: EventInstance<GalagaData>, ctx: EventContext): void {
    const d = inst.data;
    if (inst.phase === "telegraph") {
      if (inst.phaseElapsedMs <= ctx.dtMs) ctx.emit({ kind: "sound", sound: "telegraph-doom" });
      if (inst.phaseElapsedMs >= TELEGRAPH_MS) {
        inst.phase = "onset";
        spawnWave(d, ctx); // wave 1
        ctx.emit({ kind: "sound", sound: "invasion-onset" });
        ctx.emit({ kind: "toast", tone: "danger", text: "The fleet has arrived." });
      }
      return;
    }
    if (inst.phase === "onset") inst.phase = "peak";
    runWave(d, ctx, inst);
  },
  onKey(inst: EventInstance<GalagaData>, ctx: EventContext, key: string): boolean {
    if ([...key].length !== 1) return false;
    const d = inst.data;
    const lower = key.toLowerCase();
    const carrying = d.aliens
      .filter((a) => a.state === "carrying" && a.carriedCellId !== null)
      .sort((a, b) => a.id - b.id);
    for (const a of carrying) {
      const cell = ctx.state.cells.find((c) => c.id === a.carriedCellId);
      if (cell && cell.ch.toLowerCase() === lower) {
        a.state = "down";
        const cellId = a.carriedCellId!;
        a.carriedCellId = null;
        ctx.state.cells = setCellStatus(ctx.state.cells, cellId, "normal");
        ctx.state.stats.lettersRescued++;
        ctx.state.stats.aliensDowned++;
        maybeAdvanceWave(d, ctx, inst);
        return true;
      }
    }
    return false;
  },
  onPointer(inst: EventInstance<GalagaData>, ctx: EventContext, target): boolean {
    if (target.kind !== "alien") return false;
    const id = typeof target.id === "number" ? target.id : -1;
    const a = inst.data.aliens.find((x) => x.id === id);
    if (!a || (a.state !== "formation" && a.state !== "diving")) return false;
    a.state = "down";
    a.diveStartedAtMs = null;
    ctx.state.stats.aliensDowned++;
    maybeAdvanceWave(inst.data, ctx, inst);
    return true;
  },
  isResolved: (inst) => inst.phase === "done",
};
