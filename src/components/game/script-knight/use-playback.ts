"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clampFrame,
  type Frame,
  frameDelayMs,
  lastFrameOfTurn,
  nextFrame,
  prevFrame,
  type Speed,
} from "./playback";

export interface Playback {
  frame: Frame | null;
  index: number;
  playing: boolean;
  speed: Speed;
  atEnd: boolean;
  setSpeed: (speed: Speed) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  stepForward: () => void;
  stepBack: () => void;
  scrubTo: (index: number) => void;
  scrubToTurn: (turn: number) => void;
  skipToEnd: () => void;
  restart: () => void;
}

/**
 * Drives a list of frames with a clock. A new list starts playing from its first frame; at
 * "instant" it jumps to the last one. Stepping or scrubbing pauses, as a video player does.
 */
export function usePlayback(frames: readonly Frame[], initialSpeed: Speed = "1x"): Playback {
  const [speed, setSpeed] = useState<Speed>(initialSpeed);
  const [state, setState] = useState({ index: 0, playing: false });
  const [seen, setSeen] = useState(frames);

  // Adjust state while rendering when the frames change (the React-recommended reset pattern).
  if (seen !== frames) {
    setSeen(frames);
    const instant = speed === "instant";
    setState({
      index: instant ? Math.max(0, frames.length - 1) : 0,
      playing: !instant && frames.length > 1,
    });
  }

  const last = Math.max(0, frames.length - 1);
  const { index } = state;
  const playing = state.playing && index < last;

  useEffect(() => {
    if (!playing || index >= last) return;
    const timer = setTimeout(
      () => {
        setState((prev) => {
          const to = speed === "instant" ? last : nextFrame(frames, prev.index);
          return { index: to, playing: to < last };
        });
      },
      frameDelayMs(frames, index, speed),
    );
    return () => clearTimeout(timer);
  }, [playing, index, last, speed, frames]);

  const pause = useCallback(() => setState((prev) => ({ ...prev, playing: false })), []);
  const scrubTo = useCallback(
    (to: number) => setState({ index: clampFrame(frames, to), playing: false }),
    [frames],
  );

  return {
    frame: frames[index] ?? null,
    index,
    playing,
    speed,
    atEnd: frames.length > 0 && index >= last && !playing,
    setSpeed,
    play: () =>
      setState((prev) => ({ index: prev.index >= last ? 0 : prev.index, playing: last > 0 })),
    pause,
    toggle: () =>
      setState((prev) =>
        prev.playing
          ? { ...prev, playing: false }
          : { index: prev.index >= last ? 0 : prev.index, playing: last > 0 },
      ),
    stepForward: () =>
      setState((prev) => ({ index: nextFrame(frames, prev.index), playing: false })),
    stepBack: () => setState((prev) => ({ index: prevFrame(prev.index), playing: false })),
    scrubTo,
    scrubToTurn: (turn) => scrubTo(lastFrameOfTurn(frames, turn)),
    skipToEnd: () => scrubTo(last),
    restart: () => setState({ index: 0, playing: last > 0 }),
  };
}
