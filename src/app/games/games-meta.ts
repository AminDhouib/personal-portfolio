// Game metadata: the GameSlug union, titles, blurbs, and accent colors.
// Server-safe — no component imports. This is not the only place a game is
// registered: the rendered component is dispatched by the switch in
// game-loader.tsx and the animated banner by the BANNERS record in banners.tsx
// (both client-side). Adding a game means editing all three.

export type GameSlug =
  | "space-shooter"
  | "hextris"
  | "tower-stacker"
  | "typing-speed"
  | "super-voltorb-flip"
  | "password-game";

export interface GameMeta {
  slug: GameSlug;
  title: string;
  tagline: string; // short neal.fun-style hook for the banner
  description: string; // long copy on the game page
  controls?: string;
  accent: string; // hex used for banner gradient + glow
  accentTailwind: string; // tailwind class fragment (e.g. "accent-green")
  external?: true; // password-game has its own top-level route
  // Hidden from the games index + home-page menu but the route still
  // works if visited directly. Use to take a game out of rotation
  // without deleting any code.
  hidden?: true;
}

export const GAMES: GameMeta[] = [
  {
    slug: "space-shooter",
    title: "Orbital Dodge",
    tagline: "Thread the asteroid belt in 3D",
    description:
      "3D ship shooter. Move with mouse, touch, or WASD. Auto-fire breaks asteroids; dodge the rest, grab coins, unlock ships and upgrades in the shop between runs.",
    controls: "Mouse / touch / WASD to move. Bullets fire automatically.",
    accent: "#22d3ee",
    accentTailwind: "accent-blue",
  },
  {
    slug: "hextris",
    title: "Hextris",
    tagline: "Rotate the hex, match three, don't let it overflow",
    description:
      "Rotate the central hexagon to catch falling colored blocks. Match three of the same color on one face to clear them. Stack too high on any side and it's game over.",
    controls: "Click either side of the hex to rotate. Match 3 to clear.",
    accent: "#a78bfa",
    accentTailwind: "purple-400",
  },
  {
    slug: "tower-stacker",
    title: "Tower Stacker",
    tagline: "Time the drop, keep the tower steady",
    description:
      "Classic crane stacker. A block swings overhead on a rope — tap to drop it onto the tower. Land it clean for a perfect; miss and the stack lurches, and three misses end the run. How tall can you build?",
    controls: "Click or tap anywhere to drop the block.",
    accent: "#f87171",
    accentTailwind: "accent-red",
    hidden: true,
  },
  {
    slug: "typing-speed",
    title: "Typing Speed",
    tagline: "Hit the words before they scroll off",
    description:
      "Flowing sentences with animated feedback and streak bursts. Built to feel punchy — every correct letter has a little pop.",
    controls: "Type the highlighted text. Don't make mistakes.",
    accent: "#60a5fa",
    accentTailwind: "accent-blue",
  },
  {
    slug: "super-voltorb-flip",
    title: "Super Voltorb Flip",
    tagline: "Flip tiles, deduce, don't pop the bomb",
    description:
      "A faithful recreation of the HGSS Pokémon GameCorner classic. Flip tiles to collect multipliers, use row/column clue panels to deduce where Voltorbs hide, and climb 8 difficulty levels.",
    controls: "Click tiles to flip. Toggle memo mode to mark possibilities.",
    accent: "#fbbf24",
    accentTailwind: "accent-amber",
  },
  {
    slug: "password-game",
    title: "The Password Game 2",
    tagline: "The form fights back",
    description:
      "A five-act sign-up form from hell. Rules stack, creatures move in, fleets invade, and everything you keep alive fights beside you at the finale. One epic seeded run; race the daily.",
    controls: "Type. Obey the rules. Curse at the rules.",
    accent: "#f472b6",
    accentTailwind: "accent-pink",
    external: true,
  },
];

export const GAMES_BY_SLUG: Record<GameSlug, GameMeta> = Object.fromEntries(
  GAMES.map((g) => [g.slug, g]),
) as Record<GameSlug, GameMeta>;

export function getGameMeta(slug: string): GameMeta | null {
  return (GAMES_BY_SLUG as Record<string, GameMeta | undefined>)[slug] ?? null;
}
