"use client";

import { useEffect, useState } from "react";
import { Shield, Sparkles } from "lucide-react";
import { useSave } from "./super-voltorb-flip/use-save";
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

  return (
    <div
      className="w-full rounded-xl border border-(--border) bg-(--card) overflow-hidden"
      style={{ aspectRatio: "4 / 3", minHeight: 420 }}
    >
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-(--muted)">
          <div className="text-lg font-semibold mb-2">
            Playing in {save.mode === "classic" ? "Classic" : "Super"} Mode
          </div>
          <div className="text-sm">Board rendering comes in the next task.</div>
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
