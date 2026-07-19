import type { AllyId, EventDef, EventFamily, EventInstance } from "../types";

/**
 * Placeholder event machinery. A real event (Tasks 6-9) replaces its stub with its
 * own module, in place; the manifest (index.ts) keeps importing the same exported
 * name. Non-inhabitant families still ship as stubs until their task lands.
 */

/** Stub payload: a real event replaces this with its own data shape. */
type StubData = Record<string, never>;

/** Peak length before a stub auto-resolves, measured from the onset transition. */
export const STUB_PEAK_MS = 10_000;

/**
 * A placeholder event running the canonical phase lifecycle: telegraph for
 * telegraphMs, a one-tick onset, a STUB_PEAK_MS peak, then done. Phase timing reads
 * inst.phaseElapsedMs (engine-owned; never written here). Inhabitants additionally
 * carry their ally wiring so the finale's ally plumbing stays exercised before the
 * real creatures land. Stubs never inject a coupledRule.
 */
export function makeStubDef(
  id: string,
  family: EventFamily,
  telegraphMs: number,
  allyId?: AllyId,
): EventDef<StubData> {
  const def: EventDef<StubData> = {
    id,
    family,
    telegraphMs,
    init: () => ({}),
    onTick(inst: EventInstance<StubData>) {
      switch (inst.phase) {
        case "telegraph":
          if (inst.phaseElapsedMs >= telegraphMs) inst.phase = "onset";
          break;
        case "onset":
          inst.phase = "peak";
          break;
        case "peak":
          if (inst.phaseElapsedMs >= STUB_PEAK_MS) inst.phase = "done";
          break;
        case "resolving":
        case "done":
          break; // terminal: the stub lifecycle skips resolving and settles at done
      }
    },
    isResolved: (inst) => inst.phase === "done",
  };
  if (allyId !== undefined) {
    def.allyId = allyId;
    def.isAlive = () => true;
  }
  return def;
}
