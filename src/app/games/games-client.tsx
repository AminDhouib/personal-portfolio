"use client";

import { GameCard } from "@/components/game/game-card";
import { GAMES } from "./games-meta";
import { DeviceStats } from "./hub/device-stats";
import type { GameTags } from "./hub/hub-tags";
import { partitionGames } from "./hub/partition";
import { TodayStrip } from "./hub/today-strip";

export function GamesClient({ tags }: { tags: GameTags }) {
  const { featured, rest } = partitionGames(GAMES);
  return (
    <div>
      {featured && (
        <GameCard
          game={featured}
          size="lg"
          featured
          headingLevel="h2"
          tags={tags[featured.slug]}
          cta="Play now"
        />
      )}
      <TodayStrip />
      <DeviceStats />
      <section aria-labelledby="hub-more-heading" className="mt-10">
        <h2
          id="hub-more-heading"
          className="font-display text-xl font-black tracking-tight sm:text-2xl"
        >
          More games
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {rest.map((game) => (
            <GameCard
              key={game.slug}
              game={game}
              size="lg"
              headingLevel="h3"
              tags={tags[game.slug]}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
