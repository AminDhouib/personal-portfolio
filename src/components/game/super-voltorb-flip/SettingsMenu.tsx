"use client";

import { Settings } from "lucide-react";
import { useState } from "react";

export function SettingsMenu({
  mode,
  autoMemoEnabled,
  speedMode,
  musicVolume,
  sfxVolume,
  onToggleAutoMemo,
  onToggleSpeed,
  onMusicVolume,
  onSfxVolume,
}: {
  mode: "classic" | "super";
  autoMemoEnabled: boolean;
  speedMode: boolean;
  musicVolume: number;
  sfxVolume: number;
  onToggleAutoMemo: () => void;
  onToggleSpeed: () => void;
  onMusicVolume: (v: number) => void;
  onSfxVolume: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded border border-(--border) bg-(--card)/80 backdrop-blur"
        aria-label="Settings"
      >
        <Settings className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-(--card) border border-(--border) rounded-lg p-4 w-72 z-30 flex flex-col gap-3 text-sm shadow-xl">
          {mode === "super" && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoMemoEnabled}
                onChange={onToggleAutoMemo}
              />
              Smart Auto-Memo
            </label>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={speedMode}
              onChange={onToggleSpeed}
            />
            Speed Mode (3× animations)
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-(--muted)">Music: {Math.round(musicVolume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={musicVolume}
              onChange={(e) => onMusicVolume(Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-(--muted)">SFX: {Math.round(sfxVolume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sfxVolume}
              onChange={(e) => onSfxVolume(Number(e.target.value))}
            />
          </label>
        </div>
      )}
    </div>
  );
}
