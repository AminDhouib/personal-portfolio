"use client";

import { useEffect, useRef } from "react";
import { gameCrashToReport } from "@/lib/report-game-error";

/** Below this share of the stage on screen, a live run pauses. */
const MIN_VISIBLE_RATIO = 0.35;

interface LoopOptions {
  /** True while a run is live: the loop and the pause rules only exist then. */
  active: boolean;
  /** Called once per animation frame with the frame time and the gap since the last one. */
  frame: (now: number, dtMs: number) => void;
  /** A hidden tab, a window blur or a mostly off-screen stage. Never resumes by itself. */
  onPause: () => void;
}

/**
 * One rAF loop per mounted stage plus Orbital Dodge's pause rules: hidden tab, window
 * blur and under 35% visible pause the run; only the player resumes it.
 */
export function useTowerLoop({ active, frame, onPause }: LoopOptions) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef(frame);
  const pauseRef = useRef(onPause);
  useEffect(() => {
    frameRef.current = frame;
    pauseRef.current = onPause;
  });

  useEffect(() => {
    if (!active) return;
    let id = 0;
    let last: number | null = null;
    let stopped = false;

    const tick = (now: number) => {
      if (stopped) return;
      try {
        frameRef.current(now, last === null ? 0 : now - last);
        last = now;
        id = requestAnimationFrame(tick);
      } catch (err) {
        stopped = true;
        const crash = gameCrashToReport("tower-stacker", err);
        if (crash) reportError(crash);
      }
    };
    id = requestAnimationFrame(tick);

    const pause = () => pauseRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", pause);

    let observer: IntersectionObserver | null = null;
    const target = targetRef.current;
    if (typeof IntersectionObserver !== "undefined" && target) {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (entry && entry.intersectionRatio < MIN_VISIBLE_RATIO) pause();
        },
        { threshold: [0, MIN_VISIBLE_RATIO, 1] },
      );
      observer.observe(target);
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", pause);
      observer?.disconnect();
    };
  }, [active]);

  return { targetRef };
}
