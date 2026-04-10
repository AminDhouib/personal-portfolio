"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Gamepad2, Keyboard, Trophy, RotateCcw } from "lucide-react";

const GeometricFlowGame = dynamic(
  () =>
    import("@/components/game/geometric-flow").then(
      (m) => m.GeometricFlowGame
    ),
  { ssr: false, loading: () => <GameSkeleton /> }
);

const TypingSpeedGame = dynamic(
  () =>
    import("@/components/game/typing-speed").then((m) => m.TypingSpeedGame),
  { ssr: false, loading: () => <GameSkeleton /> }
);

const CodePuzzleGame = dynamic(
  () =>
    import("@/components/game/code-puzzle").then((m) => m.CodePuzzleGame),
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
    title: "Typing Speed",
    description: "Code snippets from real projects. How fast can you type?",
    icon: Keyboard,
    iconColor: "text-accent-blue",
    available: true,
  },
  {
    id: "code-puzzle",
    title: "Code Puzzle",
    description: "Spot the bug in 6 real-world snippets. Multiple choice.",
    icon: Trophy,
    iconColor: "text-accent-amber",
    available: true,
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
            onClick={() => setActiveGame(game.id)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all shrink-0 ${
              activeGame === game.id
                ? game.id === "geometric-flow"
                  ? "border-accent-pink/50 bg-accent-pink/10 text-accent-pink"
                  : game.id === "typing-speed"
                  ? "border-accent-blue/50 bg-accent-blue/10 text-accent-blue"
                  : "border-accent-amber/50 bg-accent-amber/10 text-accent-amber"
                : "border-(--border) text-(--muted) hover:border-(--muted)/40 hover:text-(--foreground)"
            }`}
          >
            <game.icon className={`h-4 w-4 ${activeGame === game.id ? game.iconColor : "opacity-60"}`} />
            {game.title}
          </button>
        ))}
      </div>

      {/* Geometric Flow */}
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

      {/* Typing Speed */}
      {activeGame === "typing-speed" && (
        <div>
          <div className="mb-4">
            <h2 className="font-display text-xl font-bold">Typing Speed</h2>
            <p className="text-sm text-(--muted) mt-0.5">
              Real code snippets. Click "Start typing" then type the snippet exactly.
            </p>
          </div>
          <TypingSpeedGame />
        </div>
      )}

      {/* Code Puzzle */}
      {activeGame === "code-puzzle" && (
        <div>
          <div className="mb-4">
            <h2 className="font-display text-xl font-bold">Code Puzzle</h2>
            <p className="text-sm text-(--muted) mt-0.5">
              Find the bug. 6 puzzles, multiple choice, instant explanation.
            </p>
          </div>
          <CodePuzzleGame />
        </div>
      )}
    </div>
  );
}
