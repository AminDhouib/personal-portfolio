import type { EventContext, EventDef, EventInstance } from "../types";

/**
 * The fake loading bar. A telegraph, then it seizes the keyboard (state.inputLocked)
 * and pretends to upload the password. Progress crawls to 97% over CRAWL_MS and sticks
 * there, taunting; every key the player mashes nudges it MASH_STEP further. At 100% —
 * or after the CAP_MS deadline no matter what — it releases the lock and reveals it was
 * "Just kidding." the whole time.
 *
 * INVARIANT: the input lock is set exactly once (at onset) and released on exactly one
 * path (the resolve in onTick). The CAP_MS deadline guarantees that resolve runs even if
 * the player never touches a key, so the lock is never left dangling — there is no second
 * unlock site to keep in sync.
 */

const EVENT_ID = "loading-bar";
const TELEGRAPH_MS = 3000;
const CRAWL_MS = 5000; // 0 -> STICK_AT over this window, then it sticks
const STICK_AT = 97;
const MASH_STEP = 0.35; // progress per mashed key (97 -> 100 needs 9 keys)
const CAP_MS = 12_000; // hard deadline after onset; guarantees the unlock

export interface LoadingBarData {
  progress: number; // 0..100+
  startedAtMs: number; // state.elapsedMs the upload began (onset)
}

export const loadingBarDef: EventDef<LoadingBarData> = {
  id: EVENT_ID,
  family: "chrome",
  telegraphMs: TELEGRAPH_MS,
  init: () => ({ progress: 0, startedAtMs: 0 }),
  onTick(inst: EventInstance<LoadingBarData>, ctx: EventContext): void {
    const d = inst.data;
    if (inst.phase === "telegraph") {
      if (inst.phaseElapsedMs >= TELEGRAPH_MS) {
        inst.phase = "onset";
        ctx.state.inputLocked = true; // the ONLY lock site
        d.startedAtMs = ctx.state.elapsedMs;
        ctx.emit({ kind: "sound", sound: "chrome-onset" });
        ctx.emit({ kind: "toast", tone: "danger", text: "Uploading password..." });
      }
      return;
    }
    if (inst.phase === "onset") inst.phase = "peak";

    const sinceOnset = ctx.state.elapsedMs - d.startedAtMs;
    // The crawl toward 97 never lowers progress the mash pushed past it.
    const crawl = Math.min(STICK_AT, (sinceOnset / CRAWL_MS) * STICK_AT);
    if (crawl > d.progress) d.progress = crawl;

    if (d.progress >= 100 || sinceOnset >= CAP_MS) {
      ctx.state.inputLocked = false; // the ONLY unlock site; CAP_MS guarantees this runs
      inst.phase = "done";
      ctx.emit({ kind: "toast", tone: "info", text: "Just kidding." });
    }
  },
  onKey(inst: EventInstance<LoadingBarData>, _ctx: EventContext, _key: string): boolean {
    // Any key — printable, Backspace, an arrow — is swallowed as a mash while locked.
    inst.data.progress += MASH_STEP;
    return true;
  },
  isResolved: (inst) => inst.phase === "done",
};
