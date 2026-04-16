"use client";

import { useEffect, useState } from "react";
import { Shield, Sparkles } from "lucide-react";
import { useSave } from "./super-voltorb-flip/use-save";
import { useGame } from "./super-voltorb-flip/use-game";
import { Board } from "./super-voltorb-flip/GameBoard";
import type { GameMode } from "./super-voltorb-flip/types";

export function SuperVoltorbFlipGame() {
  const [mounted, setMounted] = useState(false);
  const [save, updateSave] = useSave();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <LoadingShell />;
  }

  if (save.mode === null) {
    return <ModeSelect onPick={(mode) => updateSave({ mode })} />;
  }

  return <GameScreen save={save} updateSave={updateSave} />;
}

function GameScreen({
  save,
  updateSave,
}: {
  save: ReturnType<typeof useSave>[0];
  updateSave: ReturnType<typeof useSave>[1];
}) {
  const { state } = useGame({
    mode: save.mode!,
    initialTheme: save.activeTheme,
    unlockedThemes: save.unlockedThemes,
    autoMemoEnabled: save.autoMemoEnabled,
    speedMode: save.speedMode,
    totalCoins: save.totalCoins,
    initialStats: save.stats,
    onPersist: updateSave,
  });

  return (
    <div
      className="w-full rounded-xl border border-(--border) overflow-hidden relative"
      style={{
        aspectRatio: "4 / 3",
        minHeight: 420,
        backgroundImage: `url(/games/super-voltorb-flip/sprites/background.png)`,
        backgroundSize: "cover",
        imageRendering: "pixelated" as const,
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <Board board={state.board} rowHints={state.rowHints} colHints={state.colHints} />
        </div>
      </div>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="w-full h-[420px] rounded-xl border border-(--border) bg-(--card) flex items-center justify-center">
      <div className="text-(--muted) text-sm">Loading Super Voltorb Flip...</div>
    </div>
  );
}

function ModeSelect({ onPick }: { onPick: (m: GameMode) => void }) {
  return (
    <div
      className="w-full rounded-xl border border-(--border) bg-(--card) p-8 flex flex-col items-center gap-6"
      style={{ minHeight: 420 }}
    >
      <div className="text-center">
        <h3 className="text-2xl font-bold mb-2">Choose your mode</h3>
        <p className="text-(--muted) text-sm">This choice is permanent. Both modes share stats; leaderboards are separate.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
        <button
          type="button"
          onClick={() => onPick("classic")}
          className="text-left p-6 rounded-xl border border-(--border) bg-(--bg) hover:border-accent-blue transition"
        >
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-accent-blue" />
            <h4 className="text-lg font-semibold">Classic Mode</h4>
          </div>
          <p className="text-sm text-(--muted)">
            The pure HGSS experience. No abilities, no soft drops, no power-ups.
            Hit a Voltorb, lose your coins, risk a big level crash. For purists.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onPick("super")}
          className="text-left p-6 rounded-xl border border-(--border) bg-(--bg) hover:border-accent-pink transition"
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-accent-pink" />
            <h4 className="text-lg font-semibold">Super Mode</h4>
          </div>
          <p className="text-sm text-(--muted)">
            Spend coins on Shield, Voltorb Reveal, and Cash Out. Softer level
            drops when you fail. Auto-memo, speed mode, and unlockable themes.
          </p>
        </button>
      </div>
    </div>
  );
}
