import { safeLocalSet } from "@/lib/safe-storage";
import type { Cue } from "./sound-cues";
import {
  createMaster,
  scheduleCue,
  setMasterMuted,
  type CtxLike,
  type CueHandle,
  type Master,
} from "./synth";

// Tower Stacker's audio facade. One instance per mounted stage; nothing is created
// until unlock(), which the Start tap calls, so a page that only loads the game never
// opens an AudioContext. Absent key = sound on, "0" = muted.

export const SOUND_KEY = "tower:sound";

export interface TowerAudio {
  /** Create the AudioContext (from a user gesture). Safe to call again. */
  unlock(): void;
  play(cue: Cue): void;
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  /** Silence every cue still sounding. */
  stop(): void;
}

function readMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SOUND_KEY) === "0";
  } catch {
    // silent-ok: storage can be blocked; sound defaults to on.
    return false;
  }
}

export function createTowerAudio(): TowerAudio {
  let muted = readMuted();
  let master: Master | null = null;
  const live = new Set<CueHandle>();

  function wake(m: Master): void {
    if (m.ctx.state !== "suspended" && m.ctx.state !== "interrupted") return;
    // silent-ok: resume() rejects while the browser still blocks audio; the next cue retries.
    m.ctx.resume?.().catch(() => undefined);
  }

  return {
    unlock() {
      if (master || typeof window === "undefined") return;
      try {
        const Ctor =
          window.AudioContext ||
          (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx: CtxLike = new Ctor();
        master = createMaster(ctx, muted);
      } catch {
        // silent-ok: a blocked or unsupported AudioContext must not throw into the game.
        master = null;
      }
    },
    play(cue) {
      if (muted || !master) return;
      wake(master);
      const handle = scheduleCue(master.ctx, master.out, cue, master.ctx.currentTime);
      live.add(handle);
      // Cues are short; the set only exists so stop() can reach them.
      if (live.size > 32) live.clear();
    },
    isMuted: () => muted,
    setMuted(next) {
      muted = next;
      safeLocalSet(SOUND_KEY, next ? "0" : "1");
      if (master) setMasterMuted(master, next);
    },
    stop() {
      for (const handle of live) handle.stop();
      live.clear();
    },
  };
}
