import type { CharCell, EventContext, EventDef, EventInstance, Pg2RuleDef } from "../types";
import { cellsToPassword, setCellStatus } from "../cells";
import { type Rng, mulberry32, pickN, pickOne, subSeed } from "../rng";

/**
 * Data corruption. A telegraph, then one random character is corrupted; every
 * SPREAD_PERIOD_MS each corrupted cell spreads to one adjacent NORMAL neighbour,
 * but a space is a quarantine boundary — it is never corrupted and adjacency
 * never crosses it. A cell corrupted for MUTATE_AFTER_MS mutates (still counts as
 * infected, for the rule and for spread). The fix is an antidote: four fixed
 * lowercase letters that, once present anywhere in the password value, scrub the
 * corruption clean.
 *
 * Infected and mutated cells still COUNT in the password value (see cells.ts) —
 * the hazard is the spreading corruption and the injected "no infected characters"
 * rule, not a shrinking value.
 */

const EVENT_ID = "infection";
const TELEGRAPH_MS = 8000;
const SPREAD_PERIOD_MS = 7000;
const MUTATE_AFTER_MS = 45_000;

/** The coupled rule's id, and the subseed label the engine reveals it under. */
const COUPLED_RULE_ID = "no-infected";
/**
 * The antidote is drawn from the SAME seeded stream the engine hands the coupled
 * rule at reveal (`mulberry32(subSeed(seed, "rule-" + ruleId))`, see
 * engine.revealRule). Deriving it here from that identical stream lets the event
 * and the rule agree on the antidote with no cross-wiring — the rule can publish
 * it on its card while the event owns the cure.
 */
const ANTIDOTE_LABEL = "rule-" + COUPLED_RULE_ID;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

export interface InfectionData {
  antidote: string; // four distinct lowercase letters; typing them cures
  nextSpreadAtMs: number; // state.elapsedMs of the next spread pulse
  infectedSinceMs: Record<number, number>; // cell id -> elapsedMs it went corrupt
  cured: boolean; // set once the antidote cleared the corruption
}

/** Four distinct lowercase letters off `rng`, e.g. "zyxo". */
function pickAntidote(rng: Rng): string {
  return pickN(rng, ALPHABET, 4).join("");
}

const isInfected = (cell: CharCell): boolean =>
  cell.status === "infected" || cell.status === "mutated";

const isSpace = (cell: CharCell): boolean => cell.ch === " ";

/** Corrupt one random normal, non-space cell; announce the corruption. */
function onset(d: InfectionData, ctx: EventContext): void {
  d.nextSpreadAtMs = ctx.state.elapsedMs + SPREAD_PERIOD_MS;
  const candidates = ctx.state.cells.filter((c) => c.status === "normal" && !isSpace(c));
  ctx.emit({ kind: "sound", sound: "force-onset" });
  ctx.emit({ kind: "toast", tone: "danger", text: "Data corruption detected in one record." });
  if (candidates.length === 0) return;
  const target = pickOne(ctx.rng, candidates);
  ctx.state.cells = setCellStatus(ctx.state.cells, target.id, "infected", EVENT_ID);
  d.infectedSinceMs[target.id] = ctx.state.elapsedMs;
}

/**
 * One spread pulse: every currently-corrupted cell spreads to one adjacent normal
 * cell. Sources are snapshotted at the pulse start so a cell corrupted THIS pulse
 * does not chain within it; a space is never a target and is never crossed. The
 * left neighbour is preferred, so the corruption fills outward from each seed.
 */
function spreadOnce(d: InfectionData, ctx: EventContext): void {
  let cells = ctx.state.cells;
  const sources = cells.filter(isInfected).map((c) => c.id);
  for (const srcId of sources) {
    const idx = cells.findIndex((c) => c.id === srcId);
    if (idx < 0) continue;
    for (const nIdx of [idx - 1, idx + 1]) {
      const n = cells[nIdx];
      if (n && n.status === "normal" && !isSpace(n)) {
        cells = setCellStatus(cells, n.id, "infected", EVENT_ID);
        d.infectedSinceMs[n.id] = ctx.state.elapsedMs;
        break; // one victim per source per pulse
      }
    }
  }
  ctx.state.cells = cells;
}

/** Advance every due spread pulse against the run clock. */
function spreadIfDue(d: InfectionData, ctx: EventContext): void {
  while (ctx.state.elapsedMs >= d.nextSpreadAtMs) {
    spreadOnce(d, ctx);
    d.nextSpreadAtMs += SPREAD_PERIOD_MS;
  }
}

/** Flip any cell corrupted for MUTATE_AFTER_MS to "mutated" (it stays infected-for-rules). */
function mutateOverdue(d: InfectionData, ctx: EventContext): void {
  let cells = ctx.state.cells;
  for (const cell of cells) {
    if (cell.status !== "infected") continue;
    const since = d.infectedSinceMs[cell.id];
    if (since !== undefined && ctx.state.elapsedMs - since >= MUTATE_AFTER_MS) {
      cells = setCellStatus(cells, cell.id, "mutated", EVENT_ID);
    }
  }
  ctx.state.cells = cells;
}

/** If the antidote is in the password value, scrub every corrupted cell clean. */
function cureIfAntidote(
  d: InfectionData,
  ctx: EventContext,
  inst: EventInstance<InfectionData>,
): void {
  if (!cellsToPassword(ctx.state.cells).includes(d.antidote)) return;
  let cells = ctx.state.cells;
  let count = 0;
  for (const cell of cells) {
    if (isInfected(cell)) {
      cells = setCellStatus(cells, cell.id, "normal");
      count++;
    }
  }
  ctx.state.cells = cells;
  ctx.state.stats.infectionsCured += count;
  d.cured = true;
  inst.phase = "done";
  ctx.emit({ kind: "toast", tone: "success", text: "Corruption cleared." });
}

/** Coupled rule: no infected/mutated characters may remain at submit. */
const noInfectedRule: Pg2RuleDef = {
  id: COUPLED_RULE_ID,
  act: "act2",
  create: (rng) => ({
    id: COUPLED_RULE_ID,
    act: "act2",
    description: "Your password must contain no infected characters.",
    payload: { antidote: pickAntidote(rng) },
    validate: (_password, state, _api) => {
      // The event may not be live (or already gone): a clean board passes.
      const cells = Array.isArray(state.cells) ? state.cells : [];
      const count = cells.filter(isInfected).length;
      return { passed: count === 0, message: `${count} infected` };
    },
  }),
};

export const infectionDef: EventDef<InfectionData> = {
  id: EVENT_ID,
  family: "force",
  telegraphMs: TELEGRAPH_MS,
  coupledRule: noInfectedRule,
  init: (_rng, state) => ({
    antidote: pickAntidote(mulberry32(subSeed(state.seed, ANTIDOTE_LABEL))),
    nextSpreadAtMs: 0,
    infectedSinceMs: {},
    cured: false,
  }),
  onTick(inst: EventInstance<InfectionData>, ctx: EventContext): void {
    const d = inst.data;
    if (inst.phase === "telegraph") {
      if (inst.phaseElapsedMs >= TELEGRAPH_MS) {
        inst.phase = "onset";
        onset(d, ctx);
      }
      return;
    }
    if (inst.phase === "onset") inst.phase = "peak";
    spreadIfDue(d, ctx);
    mutateOverdue(d, ctx);
    cureIfAntidote(d, ctx, inst);
  },
  isResolved: (inst) => inst.data.cured,
};
