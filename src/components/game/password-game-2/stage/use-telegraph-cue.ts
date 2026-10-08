"use client";

import { useEffect, useRef } from "react";
import type { EventInstance, GameState } from "../engine/types";
import { takeTelegraphCues } from "./telegraph";

/**
 * Plays each event's telegraph cue once, on the first render that sees it winding up.
 * Runs after every render (the 250 ms heartbeat included); the seen set is what keeps
 * the heartbeat from replaying it. `play` is the shell's debounced effect path, so a
 * telegraph cue meets the same gates as every other cue (sound on, unlocked by a
 * gesture, a running context, 150 ms per key).
 */
export function useTelegraphCue(g: GameState | null, play: (cue: string) => void): void {
  const seenRef = useRef<WeakSet<EventInstance>>(new WeakSet());
  useEffect(() => {
    if (!g) return;
    for (const cue of takeTelegraphCues(g.events, seenRef.current)) play(cue);
  });
}
