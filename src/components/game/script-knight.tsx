"use client";

import { useCallback, useEffect, useState } from "react";
import type { LevelRef } from "./script-knight/engine/level-ref";
import { ReplayViewer } from "./script-knight/replay-view";
import { Stage, type StageProps } from "./script-knight/stage";
import { utcDayKey } from "@/lib/arcade/boards";

const REPLAY_PREFIX = "#replay=";

/**
 * Script Knight: write JavaScript that walks a knight up a tower. The engine, sandbox, renderer
 * and stage live in `./script-knight/`. This entry mounts the stage, and above it the replay
 * viewer when the address carries a replay link in its fragment (which never leaves the browser).
 */
export function ScriptKnightGame(props: StageProps = {}) {
  const [hash, setHash] = useState<string | null>(null);
  // "Play this floor" remounts the stage on that floor; the round keys the remount.
  const [start, setStart] = useState<LevelRef | undefined>(undefined);
  const [round, setRound] = useState(0);

  useEffect(() => {
    function read() {
      setHash(window.location.hash.startsWith(REPLAY_PREFIX) ? window.location.hash : null);
    }
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const close = useCallback(() => {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setHash(null);
  }, []);

  const play = useCallback(
    (ref: LevelRef) => {
      setStart(ref);
      setRound((value) => value + 1);
      close();
    },
    [close],
  );

  return (
    <div className="w-full space-y-6" style={{ minHeight: 480 }}>
      {hash === null ? null : (
        <ReplayViewer hash={hash} today={utcDayKey(new Date())} onPlay={play} onClose={close} />
      )}
      <Stage key={round} start={start} {...props} />
    </div>
  );
}
