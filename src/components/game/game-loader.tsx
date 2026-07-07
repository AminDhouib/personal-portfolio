"use client";

import dynamic from "next/dynamic";
import { MotionConfig } from "framer-motion";
import { useSearchParams } from "next/navigation";
import type { GameSlug } from "@/app/games/games-meta";
import { assertNever } from "@/lib/assert-never";

function GameSkeleton() {
  return (
    <div className="flex h-[420px] w-full items-center justify-center rounded-xl border border-(--border) bg-(--card)">
      <div className="text-sm text-(--muted)">Loading game...</div>
    </div>
  );
}

const TypingSpeedGame = dynamic(() => import("./typing-speed").then((m) => m.TypingSpeedGame), {
  ssr: false,
  loading: () => <GameSkeleton />,
});
const SpaceShooterGame = dynamic(() => import("./space-shooter").then((m) => m.SpaceShooterGame), {
  ssr: false,
  loading: () => <GameSkeleton />,
});
const HextrisGame = dynamic(() => import("./hextris").then((m) => m.HextrisGame), {
  ssr: false,
  loading: () => <GameSkeleton />,
});
const SuperVoltorbFlipGame = dynamic(
  () => import("./super-voltorb-flip").then((m) => m.SuperVoltorbFlipGame),
  { ssr: false, loading: () => <GameSkeleton /> },
);
const TowerStacker = dynamic(() => import("./tower-stacker"), {
  ssr: false,
  loading: () => <GameSkeleton />,
});

function renderGame(slug: GameSlug, towerSeed: string | undefined) {
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
    case "password-game":
      // password-game has a dedicated page and is not rendered through GameLoader
      return null;
    default:
      return assertNever(slug, "game-loader: no renderer registered for slug");
  }
}

export function GameLoader({ slug }: { slug: GameSlug }) {
  const searchParams = useSearchParams();
  const towerSeed = searchParams?.get("tower-seed") ?? undefined;

  const game = renderGame(slug, towerSeed);
  if (game === null) return null;

  // Games are exempt from reduced-motion by ruling; "never" pins full motion
  // regardless of the OS preference honored by the root MotionConfig (providers.tsx).
  return <MotionConfig reducedMotion="never">{game}</MotionConfig>;
}
