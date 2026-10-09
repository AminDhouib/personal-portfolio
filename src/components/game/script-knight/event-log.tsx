import type { Frame } from "./playback";
import { GAME_SURFACE } from "./surface";

export interface EventLogProps {
  frames: readonly Frame[];
  /** The frame the replay is on; the log shows everything up to and including it. */
  index: number;
  /** Lines the player's code passed to `think`, one list per turn. */
  thoughts: readonly (readonly string[])[];
}

interface Line {
  key: string;
  text: string;
  think: boolean;
}

function linesUpTo(frames: readonly Frame[], index: number, thoughts: EventLogProps["thoughts"]) {
  const lines: Line[] = [];
  let lastTurn = 0;
  for (const frame of frames.slice(0, index + 1)) {
    if (frame.turn > 0 && frame.turn !== lastTurn) {
      lastTurn = frame.turn;
      thoughts[frame.turn - 1]?.forEach((thought, i) => {
        lines.push({ key: `t${frame.turn}-think-${i}`, text: `think: ${thought}`, think: true });
      });
    }
    const prefix = frame.turn > 0 ? `Turn ${frame.turn}: ` : "";
    lines.push({ key: `f${frame.index}`, text: `${prefix}${frame.text}`, think: false });
  }
  return lines;
}

/** What has happened so far, one line per event, with the player's own `think` lines in green. */
export function EventLog({ frames, index, thoughts }: EventLogProps) {
  const lines = linesUpTo(frames, index, thoughts);
  return (
    <section aria-label="Event log">
      <ol
        role="log"
        className={`max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-(--border) p-2 font-mono text-xs ${GAME_SURFACE}`}
      >
        {lines.map((line) => (
          <li key={line.key} className={line.think ? "text-[#4ade80]" : "text-(--muted)"}>
            {line.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
