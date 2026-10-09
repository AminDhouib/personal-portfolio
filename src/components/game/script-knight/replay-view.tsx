"use client";

import { useMemo } from "react";
import { EventLog } from "./event-log";
import type { LevelRef } from "./engine/level-ref";
import { getGradeLetter } from "./engine/scoring";
import { TOWERS } from "./engine/towers";
import { FloorView } from "./floor-view";
import { playLog } from "./played";
import type { Frame } from "./playback";
import { parseReplayFragment } from "./replay-link";
import { GAME_SURFACE, TOUCH } from "./surface";
import { Transport } from "./transport";
import { usePlayback } from "./use-playback";

const BUTTON = `rounded-md border border-(--border) px-3 py-1.5 text-sm text-(--foreground) hover:border-accent-green ${TOUCH}`;

// One list for every render of a damaged link: usePlayback resets when it sees a different list,
// so a fresh [] each render would loop forever.
const NO_FRAMES: Frame[] = [];

export const DAMAGED_MESSAGE = "This replay link is damaged";

export interface ReplayViewerProps {
  /** The URL fragment, "#replay=...". */
  hash: string;
  /** The UTC day key of today, to tell a link to today's floor from one to an old daily. */
  today: string;
  /** Start playing the floor the link was on (today's floor for an old daily). */
  onPlay: (ref: LevelRef) => void;
  onClose: () => void;
}

function titleOf(ref: LevelRef): string {
  if (ref.kind === "daily") return `The daily floor of ${ref.day}`;
  return `${TOWERS[ref.tower].name}, floor ${ref.level}${ref.epic ? " (epic)" : ""}`;
}

/**
 * A shared run replayed with the pure engine on the main thread: no worker, no network, nothing
 * recorded. A link whose log does not play on its floor reads as damaged, like one that does not
 * parse.
 */
export function ReplayViewer({ hash, today, onPlay, onClose }: ReplayViewerProps) {
  const replay = useMemo(() => parseReplayFragment(hash), [hash]);
  const played = useMemo(() => (replay ? playLog(replay.ref, replay.actions) : null), [replay]);
  const frames = played?.frames ?? NO_FRAMES;
  const playback = usePlayback(frames);
  const frame = playback.frame ?? frames[0];

  if (!replay || !played || !frame) {
    return (
      <section
        aria-label="Shared replay"
        className={`rounded-lg border border-accent-red p-3 ${GAME_SURFACE}`}
      >
        <p role="alert" className="text-sm text-accent-red">
          {DAMAGED_MESSAGE}
        </p>
        <p className="mt-1 text-sm text-(--muted)">
          It could not be read, so there is nothing to replay.
        </p>
        <button type="button" onClick={onClose} className={`mt-2 ${BUTTON}`}>
          Close
        </button>
      </section>
    );
  }

  const { ref } = replay;
  const oldDaily = ref.kind === "daily" && ref.day !== today;
  const { result } = played;
  return (
    <section aria-label="Shared replay" className="space-y-3">
      <h2 className="text-base font-semibold text-(--foreground)">Shared replay: {titleOf(ref)}</h2>
      <p className="text-sm text-(--muted)">
        {result.passed && result.score
          ? `Passed in ${result.turns} turns for ${result.score.total} points, grade ${getGradeLetter(result.grade ?? 0)}.`
          : `Did not pass: ${result.turns} turns played.`}{" "}
        {ref.kind === "daily"
          ? "A replay is watched here only: it is not ranked and nothing is saved."
          : "A replay is watched here only: nothing is saved."}
      </p>
      <FloorView frame={frame} label={titleOf(ref)} />
      <Transport playback={playback} frameCount={frames.length} />
      <EventLog frames={frames} index={playback.index} thoughts={[]} />
      {oldDaily ? (
        <p className="text-sm text-(--muted)">
          That daily floor is from {ref.day}. &quot;Play today&apos;s floor&quot; opens today&apos;s
          floor, {today}, which is a different one.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onPlay(ref)} className={BUTTON}>
          {oldDaily ? "Play today's floor" : "Play this floor"}
        </button>
        <button type="button" onClick={onClose} className={BUTTON}>
          Close
        </button>
      </div>
    </section>
  );
}
