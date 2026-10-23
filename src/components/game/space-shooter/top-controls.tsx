import { Trophy, Volume2, VolumeX, Maximize2, Minimize2, Pause, Play } from "lucide-react";
import type { UiState } from "./ui-state";

export function TopControls({
  ui,
  highScore,
  togglePause,
  soundEnabled,
  toggleSound,
  isFullscreen,
  toggleFullscreen,
}: {
  ui: UiState;
  highScore: number;
  togglePause: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
}) {
  return (
    <div className="absolute top-3 right-3 flex items-center gap-2">
      {highScore > 0 && (
        <div className="pointer-events-none flex items-center gap-1 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 font-mono text-xs text-accent-amber tabular-nums backdrop-blur-sm">
          <Trophy className="h-3 w-3" />
          {highScore}
        </div>
      )}
      <button
        onClick={togglePause}
        aria-label={ui.status === "paused" ? "Resume" : "Pause"}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:text-white"
      >
        {ui.status === "paused" ? (
          <Play className="h-3.5 w-3.5" />
        ) : (
          <Pause className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        onClick={toggleSound}
        aria-label={soundEnabled ? "Mute" : "Unmute"}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:text-white"
      >
        {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:text-white"
      >
        {isFullscreen ? (
          <Minimize2 className="h-3.5 w-3.5" />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
