"use client";

import { GameCard } from "@/components/game/game-card";
import { GAMES } from "./games-meta";

export function GamesClient() {
  const [featured, ...rest] = GAMES;
  return (
    <div className="space-y-8">
      {/* Featured banner (large tile) */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <GameCard game={featured} size="lg" />
        {rest[0] && <GameCard game={rest[0]} size="lg" />}
      </div>

      {/* Rest of the gallery */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rest.slice(1).map((game) => (
          <GameCard key={game.slug} game={game} size="sm" />
        ))}
      </div>
    </div>
  );
}
