import type { AllyId, EventDef, EventFamily, EventInstance } from "../types";

/**
 * Event definition manifest. The engine resolves scheduled instances to their def
 * by id through this list. Task 3 seeds the twelve stub defs; Tasks 6-9 replace
 * each with its real event, in place. The manifest's shape never changes again.
 */

/** Stub payload: a real event (Tasks 6-9) replaces this with its own data shape. */
type StubData = Record<string, never>;

/** Peak length before a stub auto-resolves, measured from the onset transition. */
const STUB_PEAK_MS = 10_000;

/**
 * A placeholder event running the canonical phase lifecycle: telegraph for
 * telegraphMs, a one-tick onset, a STUB_PEAK_MS peak, then done. Phase timing reads
 * inst.phaseElapsedMs (engine-owned; never written here). Inhabitants additionally
 * carry their ally wiring so the finale's ally plumbing stays exercised before
 * Task 6 lands the real creatures. Stubs never inject a coupledRule.
 */
function makeStubDef(
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

export const EVENT_DEFS: EventDef[] = [
  makeStubDef("gerald", "inhabitant", 6000, "gerald"),
  makeStubDef("campfire", "inhabitant", 6000, "campfire"),
  makeStubDef("garden", "inhabitant", 8000, "garden"),
  makeStubDef("infection", "force", 8000),
  makeStubDef("black-hole", "force", 8000),
  makeStubDef("parasite", "force", 4000),
  makeStubDef("galaga", "invasion", 10000),
  makeStubDef("snake", "invasion", 6000),
  makeStubDef("tetris", "invasion", 6000),
  makeStubDef("cookie-banner", "chrome", 3000),
  makeStubDef("autocorrect", "chrome", 5000),
  makeStubDef("loading-bar", "chrome", 3000),
];
