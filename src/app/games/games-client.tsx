"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { Gamepad2, Keyboard, Trophy, RotateCcw, Rocket, Hexagon, Key, Zap, Layers } from "lucide-react";

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

const SpaceShooterGame = dynamic(
  () =>
    import("@/components/game/space-shooter").then((m) => m.SpaceShooterGame),
  { ssr: false, loading: () => <GameSkeleton /> }
);

const HextrisGame = dynamic(
  () =>
    import("@/components/game/hextris").then((m) => m.HextrisGame),
  { ssr: false, loading: () => <GameSkeleton /> }
);

const SuperVoltorbFlipGame = dynamic(
  () =>
    import("@/components/game/super-voltorb-flip").then(
      (m) => m.SuperVoltorbFlipGame
    ),
  { ssr: false, loading: () => <GameSkeleton /> }
);

const TowerStacker = dynamic(() => import("@/components/game/tower-stacker"), {
  ssr: false,
  loading: () => <GameSkeleton />,
});

function GameSkeleton() {
  return (
    <div className="w-full h-[420px] rounded-xl border border-(--border) bg-(--card) flex items-center justify-center">
      <div className="text-(--muted) text-sm">Loading game...</div>
    </div>
  );
}

type GameEntry = {
  id: string;
  title: string;
  description: string;
  icon: typeof Gamepad2;
  iconColor: string;
  available: boolean;
  controls?: string;
  external?: boolean;
  href?: string;
};

const GAMES: GameEntry[] = [
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
    description: "Type flowing sentences as fast as you can. Animated feedback, combo bursts.",
    icon: Keyboard,
    iconColor: "text-accent-blue",
    available: true,
  },
  {
    id: "space-shooter",
    title: "Orbital Dodge",
    description: "3D ship shooter. Dodge asteroids, auto-fire, level up for deadlier guns.",
    icon: Rocket,
    iconColor: "text-accent-green",
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
  {
    id: "hextris",
    title: "Hextris",
    description: "Match 3 hexagon blocks to score points. Rotate and stack strategically.",
    icon: Hexagon,
    iconColor: "text-purple-400",
    available: true,
  },
  {
    id: "password-game",
    title: "Password Game 2",
    description: "Seeded chaos sequel. Every run unique. (Opens in new page)",
    icon: Key,
    iconColor: "text-accent-pink",
    available: true,
    external: true,
    href: "/games/password-game",
  },
  {
    id: "super-voltorb-flip",
    title: "Super Voltorb Flip",
    description: "A faithful recreation of the HGSS classic — with modern upgrades. Deduce, flip, multiply your coins. Don't hit the Voltorb.",
    icon: Zap,
    iconColor: "text-accent-amber",
    available: true,
    controls: "Click tiles to flip. Open memo mode to mark possibilities. Spend coins on Shields & Reveals.",
  },
  {
    id: "tower-stacker",
    title: "Tower Stacker",
    description: "Stack blocks. Miss a sliver, lose width. Perfect stacks ring higher. How tall can you build?",
    icon: Layers,
    iconColor: "text-accent-red",
    available: true,
  },
];

function ExternalOrTabButton({
  game,
  active,
  onClick,
}: {
  game: GameEntry;
  active: boolean;
  onClick: () => void;
}) {
  const className = `flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all shrink-0 ${
    active
      ? game.id === "geometric-flow"
        ? "border-accent-pink/50 bg-accent-pink/10 text-accent-pink"
        : game.id === "typing-speed"
        ? "border-accent-blue/50 bg-accent-blue/10 text-accent-blue"
        : game.id === "space-shooter"
        ? "border-accent-green/50 bg-accent-green/10 text-accent-green"
        : game.id === "code-puzzle"
        ? "border-accent-amber/50 bg-accent-amber/10 text-accent-amber"
        : game.id === "hextris"
        ? "border-purple-400/50 bg-purple-400/10 text-purple-400"
        : game.id === "tower-stacker"
        ? "border-accent-red/50 bg-accent-red/10 text-accent-red"
        : "border-accent-pink/50 bg-accent-pink/10 text-accent-pink"
      : "border-(--border) text-(--muted) hover:border-(--muted)/40 hover:text-(--foreground)"
  }`;
  const content = (
    <>
      <game.icon className={`h-4 w-4 ${active ? game.iconColor : "opacity-60"}`} />
      {game.title}
    </>
  );
  if (game.external && game.href) {
    return (
      <Link href={game.href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={className} type="button">
      {content}
    </button>
  );
}

export function GamesClient() {
  const [activeGame, setActiveGame] = useState("space-shooter");

  return (
    <div className="space-y-8">
      {/* Game selector tabs */}
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        {GAMES.map((game) => (
          <ExternalOrTabButton
            key={game.id}
            game={game}
            active={activeGame === game.id}
            onClick={() => setActiveGame(game.id)}
          />
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
              Flowing sentences, animated feedback, streak bursts. Click Start and go.
            </p>
          </div>
          <TypingSpeedGame />
        </div>
      )}

      {/* Space Shooter */}
      {activeGame === "space-shooter" && (
        <div>
          <div className="mb-4">
            <h2 className="font-display text-xl font-bold">Orbital Dodge</h2>
            <p className="text-sm text-(--muted) mt-0.5">
              3D ship shooter. Move with mouse / touch / WASD. Auto-fire destroys asteroids; dodge the rest to level up.
            </p>
          </div>
          <SpaceShooterGame />
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

      {/* Hextris */}
      {activeGame === "hextris" && (
        <div>
          <div className="mb-4">
            <h2 className="font-display text-xl font-bold">Hextris</h2>
            <p className="text-sm text-(--muted) mt-0.5">
              Match 3 hexagon blocks to score points. Rotate hexagon and stack blocks strategically.
            </p>
          </div>
          <HextrisGame />
        </div>
      )}

      {/* Super Voltorb Flip */}
      {activeGame === "super-voltorb-flip" && <SuperVoltorbFlipGame />}

      {/* Tower Stacker */}
      {activeGame === "tower-stacker" && (
        <div>
          <div className="mb-4">
            <h2 className="font-display text-xl font-bold">Tower Stacker</h2>
            <p className="text-sm text-(--muted) mt-0.5">
              Stack blocks. Miss a sliver, lose width. Perfect stacks ring higher. How tall can you build?
            </p>
          </div>
          <TowerStacker />
        </div>
      )}
    </div>
  );
}
