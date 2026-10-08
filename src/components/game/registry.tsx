"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { GameSlug } from "@/app/games/games-meta";
import { WebGLOnly } from "@/components/three/webgl-only";
import {
  HextrisBanner,
  PasswordGameBanner,
  SpaceShooterBanner,
  SuperVoltorbFlipBanner,
  TowerStackerBanner,
  TypingSpeedBanner,
} from "./banners";
import { NeedsWebGL } from "./space-shooter/needs-webgl";

// The client half of the game registry: one entry per GameSlug, so a new game
// does not compile until it has a banner and a renderer. The server half (the
// About copy, SEO fields and credits) is GAME_CONTENT in src/app/games/content.

export interface GameClientEntry {
  /** Animated art for the game's card. */
  Banner: () => ReactNode;
  /** The playable game, or null where the game has its own route (password-game). */
  render: ((ctx: { towerSeed: string | undefined }) => ReactNode) | null;
}

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

export const GAME_CLIENT: Record<GameSlug, GameClientEntry> = {
  "space-shooter": {
    Banner: SpaceShooterBanner,
    render: () => (
      <WebGLOnly fallback={<NeedsWebGL />} pending={<GameSkeleton />}>
        <SpaceShooterGame variant="page" />
      </WebGLOnly>
    ),
  },
  hextris: { Banner: HextrisBanner, render: () => <HextrisGame /> },
  "tower-stacker": {
    Banner: TowerStackerBanner,
    render: ({ towerSeed }) => <TowerStacker initialSeed={towerSeed} />,
  },
  "typing-speed": { Banner: TypingSpeedBanner, render: () => <TypingSpeedGame /> },
  "super-voltorb-flip": { Banner: SuperVoltorbFlipBanner, render: () => <SuperVoltorbFlipGame /> },
  "password-game": { Banner: PasswordGameBanner, render: null },
};

export function GameBanner({ slug }: { slug: GameSlug }) {
  const { Banner } = GAME_CLIENT[slug];
  return <Banner />;
}
