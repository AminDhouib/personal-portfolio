import type { CharCell, EventContext, EventDef, EventInstance } from "../types";
import { VALUE_EXCLUDED } from "../cells";
import { rangeInt } from "../rng";
import type { GeraldData } from "./gerald";
import type { GardenData } from "./garden";
import type { CampfireData } from "./campfire";

/**
 * The autocorrect demon. A telegraph, then every SCAN_PERIOD_MS it scans the password
 * value for the FIRST word it can "helpfully" mangle (see CORRECTION_PAIRS) and rewrites
 * those cells in place with fresh, normal cells — a toast is the only tell. It never
 * touches the cursor beyond the length shift its edit forces. The off switch hides in a
 * settings modal of six corporate-nonsense toggles; exactly one ("Helpful corrections",
 * relocated to a seeded slot) disables the demon. Left alone it gets bored after 75s.
 * Typing is never locked — the hazard is the silent rewrite, not a stun.
 */

const EVENT_ID = "autocorrect";
const TELEGRAPH_MS = 5000;
const SCAN_PERIOD_MS = 8000;
const AUTO_RESOLVE_MS = 75_000;

/**
 * Source word -> the demon's "correction". Scanned in order, so earlier pairs win a
 * tie. The five month pairs each map a month to the NEXT month (still a valid month —
 * the demon cannot actually break the include-month rule, only the digit/length rules
 * a shifted word disturbs); the rest are gremlin typos and non-sequiturs. Exported for
 * the Task 12 renderer and the unit tests.
 */
export const CORRECTION_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["january", "february"],
  ["march", "april"],
  ["may", "june"],
  ["july", "august"],
  ["october", "november"],
  ["dragon", "dargon"],
  ["human", "hunan"],
  ["password", "passward"],
  ["fire", "fira"],
  ["gerald", "gerard"],
  ["honey", "hone"],
  ["neutron", "croutons"],
  ["anvil", "anivl"],
  ["submit", "sumbit"],
];

/**
 * The six settings toggles, in their canonical order. Index 1 ("Helpful corrections")
 * is the real off switch; toggleLabelsFor moves it to the seeded slot for display.
 * Exported for the Task 12 renderer and the unit tests.
 */
export const TOGGLE_LABELS: readonly string[] = [
  "Enable enhanced experience",
  "Helpful corrections",
  "Optimize engagement",
  "Personalized nudges",
  "Smart everything",
  "Allow essential magic",
];

/**
 * The labels as shown to the player: "Helpful corrections" (canonical index 1) swapped
 * into `correctToggleIndex`, so the real switch sits at the seeded slot. Deterministic —
 * the same index always yields the same ordering. The stage renders this; the engine
 * checks the raw index against `correctToggleIndex`.
 */
export function toggleLabelsFor(correctToggleIndex: number): string[] {
  const labels = [...TOGGLE_LABELS];
  const a = labels[1];
  const b = labels[correctToggleIndex];
  if (a !== undefined && b !== undefined) {
    labels[1] = b;
    labels[correctToggleIndex] = a;
  }
  return labels;
}

export interface AutocorrectData {
  corrections: number; // words mangled so far
  nextScanAtMs: number; // state.elapsedMs of the next scan
  disabled: boolean; // the demon has been switched off
  settingsOpen: boolean; // the settings modal is showing
  correctToggleIndex: number; // 0..5: the slot holding the real off switch
  lastRewriteAtMs: number; // state.elapsedMs of the last rewrite, for the painter's flash tell
  lastRewriteCellIds: number[]; // ids of the cells the last rewrite minted; display-only
}

/** Value-bearing cells contribute to the password; excluded cells (abducted, etc.) do not. */
const isValueCell = (cell: CharCell): boolean => !VALUE_EXCLUDED.has(cell.status);

/**
 * Chain 1: the demon is the ecosystem's antagonist. When it mangles a word that names
 * an inhabitant, it also strikes that inhabitant. Keyed by CORRECTION_PAIRS source word;
 * the value is the victim's event defId. Only source words that a live inhabitant answers
 * to appear here — every other rewrite is inert as before.
 */
const SABOTAGE: Record<string, "gerald" | "garden" | "campfire"> = {
  gerald: "gerald", // "gerald" -> "gerard": Gerald goes hungrier
  honey: "garden", // "honey" -> "hone": the hive loses honey
  fire: "campfire", // "fire" -> "fira": the campfire loses fuel
};

const SABOTAGE_HUNGER = 25; // Gerald's hunger jump when his word is eaten (clamped at 100)
const SABOTAGE_HONEY = 15; // honey drained from the hive (floored at 0)
const SABOTAGE_FUEL = 20; // fuel knocked off the campfire (floored at 0)

/** The victim-specific mood line, emitted on the victim's own eventId so it lands on their card. */
const SABOTAGE_MOOD: Record<"gerald" | "garden" | "campfire", string> = {
  gerald: "The autocorrect demon ate Gerald's dinner",
  garden: "The autocorrect demon drained the hive",
  campfire: "The autocorrect demon damped the fire",
};

/**
 * Strike the named inhabitant if it is live. Cross-event read via the shared idiom: an
 * instance in telegraph or done (or not yet inited) is not a valid victim, so the rewrite
 * behaves exactly as it did before this chain. The hit is a fixed constant on already-
 * deterministic data, so no new rng enters play.
 */
function sabotage(victim: "gerald" | "garden" | "campfire", ctx: EventContext): void {
  const inst = ctx.state.events.find((e) => e.defId === victim);
  if (!inst || inst.phase === "telegraph" || inst.phase === "done" || inst.data === undefined) {
    return;
  }
  if (victim === "gerald") {
    const d = inst.data as GeraldData;
    d.hunger = Math.min(100, d.hunger + SABOTAGE_HUNGER);
  } else if (victim === "garden") {
    const d = inst.data as GardenData;
    d.honey = Math.max(0, d.honey - SABOTAGE_HONEY);
  } else {
    const d = inst.data as CampfireData;
    d.fuel = Math.max(0, d.fuel - SABOTAGE_FUEL);
  }
  ctx.emit({ kind: "mood", eventId: victim, text: SABOTAGE_MOOD[victim] });
}

/**
 * Perform one correction: find the first pair whose source appears (case-insensitive)
 * in the password value, then splice the matched value-cells out and drop the correction
 * in as fresh, normal cells. An excluded cell interleaved with the match survives by id
 * but slides to just past the replacement block (the replacement is inserted at the
 * match's first cell index, and only the matched value-cells are removed). The caret
 * shifts by the length delta when the edit lands at or left of it. Returns whether a
 * correction was made.
 */
function correctOnce(d: AutocorrectData, ctx: EventContext): boolean {
  const cells = ctx.state.cells;
  // Map each value position to its cell index, and build the lowercased value string.
  const valueCellIdx: number[] = [];
  let value = "";
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    if (!isValueCell(cell)) continue;
    valueCellIdx.push(i);
    value += cell.ch.toLowerCase();
  }

  for (const [source, replacement] of CORRECTION_PAIRS) {
    const at = value.indexOf(source);
    if (at === -1) continue;

    // Cell indices of the matched run (contiguous in value space, maybe not in cell
    // space if an excluded cell sits between two of the letters).
    const matched = valueCellIdx.slice(at, at + source.length);
    const insertAt = matched[0]!;
    const removeSet = new Set(matched);
    const replacementCells: CharCell[] = [...replacement].map((ch) => ({
      id: ctx.state.nextCellId++,
      ch,
      status: "normal" as const,
    }));

    const next: CharCell[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (i === insertAt) next.push(...replacementCells);
      if (removeSet.has(i)) continue; // drop the matched letter
      next.push(cells[i]!);
    }
    ctx.state.cells = next;

    // Shift the caret by the net cell delta for edits at or left of it.
    const oldCaret = ctx.state.caret;
    const removedLeft = matched.filter((i) => i < oldCaret).length;
    const insertedLeft = insertAt < oldCaret ? replacementCells.length : 0;
    ctx.state.caret = Math.max(0, Math.min(oldCaret - removedLeft + insertedLeft, next.length));

    d.corrections++;
    d.lastRewriteAtMs = ctx.state.elapsedMs;
    d.lastRewriteCellIds = replacementCells.map((cell) => cell.id);
    ctx.emit({ kind: "toast", tone: "info", text: "Corrected for you." });
    const victim = SABOTAGE[source];
    if (victim) sabotage(victim, ctx);
    return true;
  }
  return false;
}

export const autocorrectDef: EventDef<AutocorrectData> = {
  id: EVENT_ID,
  family: "chrome",
  telegraphMs: TELEGRAPH_MS,
  init: (rng) => ({
    corrections: 0,
    nextScanAtMs: 0,
    disabled: false,
    settingsOpen: false,
    correctToggleIndex: rangeInt(rng, 0, 5),
    lastRewriteAtMs: 0,
    lastRewriteCellIds: [],
  }),
  onTick(inst: EventInstance<AutocorrectData>, ctx: EventContext): void {
    const d = inst.data;
    if (inst.phase === "telegraph") {
      if (inst.phaseElapsedMs >= TELEGRAPH_MS) {
        inst.phase = "onset";
        d.nextScanAtMs = ctx.state.elapsedMs + SCAN_PERIOD_MS;
        ctx.emit({ kind: "sound", sound: "chrome-onset" });
      }
      return;
    }
    if (inst.phase === "onset") {
      inst.phase = "peak"; // settle a frame so the phaseElapsedMs boredom clock starts clean
      return;
    }
    // Bored: the demon gives up on its own. phaseElapsedMs measures from the peak entry.
    if (inst.phaseElapsedMs >= AUTO_RESOLVE_MS) {
      d.disabled = true;
      inst.phase = "done";
      ctx.emit({ kind: "toast", tone: "info", text: "The demon gets bored." });
      return;
    }
    if (d.disabled) return;
    while (ctx.state.elapsedMs >= d.nextScanAtMs) {
      correctOnce(d, ctx);
      d.nextScanAtMs += SCAN_PERIOD_MS;
    }
  },
  onPointer(inst: EventInstance<AutocorrectData>, ctx: EventContext, target): boolean {
    const d = inst.data;
    if (target.kind === "settings-gear") {
      d.settingsOpen = !d.settingsOpen;
      return true;
    }
    if (target.kind === "settings-toggle") {
      const i = typeof target.id === "number" ? target.id : -1;
      if (i === d.correctToggleIndex) {
        d.disabled = true;
        d.settingsOpen = false;
        inst.phase = "done";
        ctx.emit({
          kind: "toast",
          tone: "success",
          text: "Helpful corrections disabled. The demon sulks.",
        });
        return true;
      }
      ctx.emit({ kind: "toast", tone: "info", text: "That setting does nothing." });
      return true;
    }
    return false;
  },
  isResolved: (inst) => inst.phase === "done",
};
