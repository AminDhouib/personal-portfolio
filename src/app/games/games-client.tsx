"use client";

import { GameCard } from "@/components/game/game-card";
import { GAMES } from "./games-meta";

export function GamesClient() {
  const [featured, ...rest] = GAMES.filter((g) => !g.hidden);
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {featured && (
        <div className="sm:col-span-2">
          <GameCard game={featured} size="lg" featured />
        </div>
      )}
      {rest.map((game) => (
        <GameCard key={game.slug} game={game} size="lg" />
      ))}
    </div>
  );
}
