import type { GameMeta } from "@/app/games/games-meta";

/**
 * Splits the public games into the featured one (by its `featured` flag, wherever it sits
 * in the list) and the rest, in registry order. Hidden games are in neither half.
 */
export function partitionGames(games: readonly GameMeta[]): {
  featured: GameMeta | undefined;
  rest: GameMeta[];
} {
  const visible = games.filter((game) => !game.hidden);
  const featured = visible.find((game) => game.featured);
  return { featured, rest: visible.filter((game) => game !== featured) };
}
