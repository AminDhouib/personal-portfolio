"use client";

import { useEffect, useState } from "react";
import { Shield, Sparkles } from "lucide-react";
import { useSave } from "./super-voltorb-flip/use-save";
import { useGame } from "./super-voltorb-flip/use-game";
import { Board } from "./super-voltorb-flip/GameBoard";
import { Scoreboard } from "./super-voltorb-flip/Scoreboard";
import { MemoPanel } from "./super-voltorb-flip/MemoPanel";
import { AbilityBar } from "./super-voltorb-flip/AbilityBar";
import { SettingsMenu } from "./super-voltorb-flip/SettingsMenu";
import { StatsPanel } from "./super-voltorb-flip/StatsPanel";
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
  const { state, dispatch } = useGame({
    mode: save.mode!,
    initialTheme: save.activeTheme,
    unlockedThemes: save.unlockedThemes,
    autoMemoEnabled: save.autoMemoEnabled,
    speedMode: save.speedMode,
    totalCoins: save.totalCoins,
    initialStats: save.stats,
    onPersist: updateSave,
  });

  useEffect(() => {
    let raf = 0;
    let running = true;

    function tick() {
      if (!running) return;
      let hasAnimating = false;
      for (const row of state.board) {
        for (const t of row) {
          if (t.animFrame !== null) { hasAnimating = true; break; }
        }
        if (hasAnimating) break;
      }
      if (hasAnimating) {
        dispatch({ type: "advanceAnim", step: state.speedMode ? 3 : 1 });
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [state.board, state.speedMode, dispatch]);

  return (
    <>
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
      <div className="absolute top-3 right-3 z-20">
        <SettingsMenu
          mode={state.mode}
          autoMemoEnabled={state.autoMemoEnabled}
          speedMode={state.speedMode}
          musicVolume={save.musicVolume}
          sfxVolume={save.sfxVolume}
          onToggleAutoMemo={() => dispatch({ type: "toggleAutoMemo" })}
          onToggleSpeed={() => dispatch({ type: "toggleSpeed" })}
          onMusicVolume={(v) => updateSave({ musicVolume: v })}
          onSfxVolume={(v) => updateSave({ sfxVolume: v })}
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="flex gap-4 items-start w-full max-w-2xl">
          <div className="flex-1">
            <Board
              board={state.board}
              rowHints={state.rowHints}
              colHints={state.colHints}
              onTileClick={(r, c) => {
                if (state.phase === "memo") {
                  dispatch({ type: "selectMemoTile", row: r, col: c });
                } else {
                  dispatch({ type: "flip", row: r, col: c });
                }
              }}
            />
          </div>
          <Scoreboard
            level={state.level}
            currentCoins={state.currentCoins}
            totalCoins={state.totalCoins}
          />
          <MemoPanel
            open={state.phase === "memo"}
            selectedMemos={
              state.selectedMemoTile
                ? state.board[state.selectedMemoTile.row][state.selectedMemoTile.col].memos
                : [false, false, false, false]
            }
            copyMode={state.memoCopyMode}
            onToggle={() => dispatch({ type: "toggleMemo" })}
            onMarkChange={(idx) => dispatch({ type: "toggleMemoMark", idx })}
            onToggleCopy={() => dispatch({ type: "toggleMemoCopy" })}
          />
        </div>
      </div>
      {(state.phase === "won" || state.phase === "lost") && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <div className="bg-white/95 dark:bg-(--card) rounded-lg p-6 text-center max-w-sm border border-(--border)">
            <div className="text-xl font-bold mb-2">
              {state.phase === "won"
                ? `Level ${state.level} Cleared!`
                : state.shieldedLoss
                ? "Shield Absorbed! Coins Saved."
                : "Voltorb! Coins Lost."}
            </div>
            <div className="text-sm text-(--muted) mb-4">
              {state.phase === "won"
                ? `+${state.currentCoins} coins`
                : state.shieldedLoss
                ? `Kept ${state.currentCoins} coins`
                : ""}
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: "continue" })}
              className="px-4 py-2 bg-accent-pink text-white rounded font-medium"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
    {state.mode === "super" && (
      <AbilityBar
        level={state.level}
        totalCoins={state.totalCoins}
        shieldArmed={state.shieldArmed}
        voltorbRevealsUsed={state.voltorbRevealsUsed}
        currentCoins={state.currentCoins}
        onArmShield={() => dispatch({ type: "armShield" })}
        onUseReveal={() => dispatch({ type: "useVoltorbReveal" })}
        onCashOut={() => dispatch({ type: "cashOut" })}
      />
    )}
    <StatsPanel stats={state.stats} />
    </>
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
