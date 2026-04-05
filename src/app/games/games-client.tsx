"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Gamepad2, Keyboard, Trophy, RotateCcw, Lock } from "lucide-react";

const GeometricFlowGame = dynamic(
  () =>
    import("@/components/game/geometric-flow").then(
      (m) => m.GeometricFlowGame
    ),
  { ssr: false, loading: () => <GameSkeleton /> }
);

function GameSkeleton() {
  return (
    <div className="w-full h-[420px] rounded-xl border border-(--border) bg-(--card) flex items-center justify-center">
      <div className="text-(--muted) text-sm">Loading game...</div>
    </div>
  );
}

const GAMES = [
  {
    id: "geometric-flow",
    title: "Geometric Flow",
    description: "Navigate a green triangle through a field of wireframe shapes. Click / tap to switch lanes.",
    icon: Gamepad2,
    iconColor: "text-accent-pink",
    available: true,
    controls: "Click or tap anywhere to switch lanes",
  },
  {
    id: "typing-speed",
    title: "Typing Speed Test",
    description: "Code snippets from real projects. How fast can you type?",
    icon: Keyboard,
    iconColor: "text-accent-cyan",
    available: false,
  },
  {
    id: "code-puzzle",
    title: "Code Puzzle",
    description: "Fix the broken code snippet. A debugging mini-game.",
    icon: Trophy,
    iconColor: "text-accent-amber",
    available: false,
  },
];

export function GamesClient() {
  const [activeGame, setActiveGame] = useState("geometric-flow");

  return (
    <div className="space-y-8">
      {/* Game selector tabs */}
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        {GAMES.map((game) => (
          <button
            key={game.id}
            onClick={() => game.available && setActiveGame(game.id)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all shrink-0 ${
              game.available
                ? activeGame === game.id
                  ? "border-accent-pink/50 bg-accent-pink/10 text-accent-pink"
                  : "border-(--border) text-(--muted) hover:border-(--muted)/40 hover:text-(--foreground)"
                : "border-(--border) text-(--muted)/40 cursor-not-allowed"
            }`}
          >
            <game.icon className={`h-4 w-4 ${game.available ? game.iconColor : "opacity-40"}`} />
            {game.title}
            {!game.available && <Lock className="h-3 w-3 opacity-40" />}
          </button>
        ))}
      </div>

      {/* Active game */}
      {activeGame === "geometric-flow" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-display text-xl font-bold">Geometric Flow</h2>
              <p className="text-sm text-(--muted) mt-0.5">
                Navigate through the field. Click / tap to switch lanes.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-xs text-(--muted)">
              <span className="flex items-center gap-1">
                <Trophy className="h-3.5 w-3.5 text-accent-amber" />
                High score saved locally
              </span>
              <span className="flex items-center gap-1">
                <RotateCcw className="h-3.5 w-3.5" />
                Tap dead screen to restart
              </span>
            </div>
          </div>
          <GeometricFlowGame key="arcade-game" />
        </div>
      )}
    </div>
  );
}
