"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { GameSlug } from "@/app/games/games-meta";

function GameSkeleton() {
  return (
    <div className="w-full h-[420px] rounded-xl border border-(--border) bg-(--card) flex items-center justify-center">
      <div className="text-(--muted) text-sm">Loading game...</div>
    </div>
  );
}

const TypingSpeedGame = dynamic(
  () => import("./typing-speed").then((m) => m.TypingSpeedGame),
  { ssr: false, loading: () => <GameSkeleton /> },
);
const SpaceShooterGame = dynamic(
  () => import("./space-shooter").then((m) => m.SpaceShooterGame),
  { ssr: false, loading: () => <GameSkeleton /> },
);
const HextrisGame = dynamic(
  () => import("./hextris").then((m) => m.HextrisGame),
  { ssr: false, loading: () => <GameSkeleton /> },
);
const SuperVoltorbFlipGame = dynamic(
  () => import("./super-voltorb-flip").then((m) => m.SuperVoltorbFlipGame),
  { ssr: false, loading: () => <GameSkeleton /> },
);
const TowerStacker = dynamic(() => import("./tower-stacker"), {
  ssr: false,
  loading: () => <GameSkeleton />,
});

export function GameLoader({ slug }: { slug: GameSlug }) {
  const searchParams = useSearchParams();
  const towerSeed = searchParams?.get("tower-seed") ?? undefined;

  switch (slug) {
    case "typing-speed":
      return <TypingSpeedGame />;
    case "space-shooter":
      return <SpaceShooterGame />;
    case "hextris":
      return <HextrisGame />;
    case "super-voltorb-flip":
      return <SuperVoltorbFlipGame />;
    case "tower-stacker":
      return <TowerStacker initialSeed={towerSeed} />;
    default:
      return null;
  }
}
