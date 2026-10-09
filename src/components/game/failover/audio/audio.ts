import { loadAudioOn, saveAudioOn } from "../prefs";
import { CUES, type CueName } from "./cues";
import {
  createMaster,
  scheduleCue,
  setMasterMuted,
  type CtxLike,
  type CueHandle,
  type Master,
} from "./synth";

// Failover's audio facade. Sound is off until the player turns it on (the
// choice is kept in failover:audio). Nothing is created until unlock(), which
// the board's first pointerdown or keydown calls, so loading the page never
// opens an AudioContext.

export interface FailoverAudio {
  /** Create the AudioContext (from a user gesture). Safe to call again. */
  unlock(): void;
  /** Play a cue at `nowMs` (any monotonic clock); a cue inside its minimum gap is skipped. */
  play(name: CueName, nowMs: number): void;
  isOn(): boolean;
  setOn(on: boolean): void;
  /** Release the AudioContext (unmount). Safe to call twice; unlock() can reopen one. */
  close(): void;
}

/** The browser's AudioContext, or null where there is none. */
function browserContext(): CtxLike | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

export function createFailoverAudio(
  makeContext: () => CtxLike | null = browserContext,
): FailoverAudio {
  let on = loadAudioOn();
  let master: Master | null = null;
  const live = new Set<CueHandle>();
  const lastPlayed = new Map<CueName, number>();

  function stopAll(): void {
    for (const handle of live) handle.stop();
    live.clear();
  }

  return {
    unlock() {
      if (master) return;
      try {
        const ctx = makeContext();
        master = ctx ? createMaster(ctx, !on) : null;
      } catch {
        // silent-ok: a blocked or unsupported AudioContext must not throw into the game.
        master = null;
      }
    },
    play(name, nowMs) {
      if (!on || !master) return;
      const cue = CUES[name];
      const last = lastPlayed.get(name);
      if (last !== undefined && nowMs - last < cue.minGapMs) return;
      lastPlayed.set(name, nowMs);
      if (master.ctx.state === "suspended" || master.ctx.state === "interrupted") {
        // silent-ok: resume() rejects while the browser still blocks audio; the next cue retries.
        master.ctx.resume?.().catch(() => undefined);
      }
      live.add(scheduleCue(master.ctx, master.out, cue, master.ctx.currentTime));
      // Cues are short; the set only exists so muting can reach them.
      if (live.size > 32) live.clear();
    },
    isOn: () => on,
    setOn(next) {
      on = next;
      saveAudioOn(next);
      if (master) setMasterMuted(master, !next);
      if (!next) stopAll();
    },
    close() {
      stopAll();
      const current = master;
      master = null;
      // silent-ok: close() rejects on a context that is already closed.
      current?.ctx.close?.().catch(() => undefined);
    },
  };
}
