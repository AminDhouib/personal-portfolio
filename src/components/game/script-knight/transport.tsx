import { type Speed, SPEEDS } from "./playback";
import { TOUCH } from "./surface";
import type { Playback } from "./use-playback";

const BUTTON = `rounded-md border border-(--border) px-2.5 py-1 text-xs text-(--foreground) hover:border-accent-green disabled:opacity-40 ${TOUCH}`;

export interface TransportProps {
  playback: Playback;
  frameCount: number;
  muted: boolean;
  onToggleMute: () => void;
}

/** Play, pause, step, scrub and speed for a replay, plus the sound toggle. */
export function Transport({ playback, frameCount, muted, onToggleMute }: TransportProps) {
  const disabled = frameCount <= 1;
  return (
    <div role="group" aria-label="Playback" className="flex flex-wrap items-center gap-2">
      <button type="button" className={BUTTON} disabled={disabled} onClick={playback.restart}>
        Restart
      </button>
      <button
        type="button"
        className={BUTTON}
        aria-label="Step back"
        disabled={disabled}
        onClick={playback.stepBack}
      >
        Back
      </button>
      <button type="button" className={BUTTON} disabled={disabled} onClick={playback.toggle}>
        {playback.playing ? "Pause" : "Play"}
      </button>
      <button
        type="button"
        className={BUTTON}
        aria-label="Step forward"
        disabled={disabled}
        onClick={playback.stepForward}
      >
        Forward
      </button>
      <button type="button" className={BUTTON} disabled={disabled} onClick={playback.skipToEnd}>
        Skip to end
      </button>
      <label className="flex items-center gap-1 text-xs text-(--muted)">
        Speed
        <select
          value={playback.speed}
          onChange={(event) => playback.setSpeed(event.target.value as Speed)}
          className={`rounded-md border border-(--border) bg-transparent px-1.5 py-1 text-xs text-(--foreground) ${TOUCH}`}
        >
          {SPEEDS.map((speed) => (
            <option key={speed} value={speed} className="bg-(--background)">
              {speed}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className={BUTTON} aria-pressed={muted} onClick={onToggleMute}>
        {muted ? "Sound off" : "Sound on"}
      </button>
      <input
        type="range"
        aria-label="Scrub the replay"
        min={0}
        max={Math.max(0, frameCount - 1)}
        value={playback.index}
        disabled={disabled}
        onChange={(event) => playback.scrubTo(Number(event.target.value))}
        className="min-w-32 flex-1 accent-accent-green pointer-coarse:h-11"
      />
    </div>
  );
}
