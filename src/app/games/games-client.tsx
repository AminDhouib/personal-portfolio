"use client";

import { GameCard } from "@/components/game/game-card";
import { GAMES } from "./games-meta";

export function GamesClient() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {GAMES.map((game) => (
        <GameCard key={game.slug} game={game} size="lg" />
      ))}
    </div>
  );
}
