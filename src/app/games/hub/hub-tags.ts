import { GAME_CONTENT } from "@/app/games/content";
import type { GameContent } from "@/app/games/content/types";
import { GAMES, type GameSlug } from "@/app/games/games-meta";

/** Chip labels per public game, as plain props the client hub can take. */
export type GameTags = Partial<Record<GameSlug, readonly string[]>>;

const PLAY_MODE_LABEL: Record<GameContent["playMode"], string> = {
  SinglePlayer: "Single player",
  MultiPlayer: "Multiplayer",
  CoOp: "Co-op",
};

/**
 * Up to two genres and the play mode, from each public game's server-side About content.
 * Server-only on purpose: GAME_CONTENT is large and stays out of the client bundle, so the
 * server page calls this and passes the result down as props.
 */
export function hubTags(): GameTags {
  const tags: GameTags = {};
  for (const game of GAMES) {
    if (game.hidden) continue;
    const content = GAME_CONTENT[game.slug];
    tags[game.slug] = [...content.genre.slice(0, 2), PLAY_MODE_LABEL[content.playMode]];
  }
  return tags;
}
