// Game metadata: the GameSlug union, titles, blurbs, and accent colors.
// Server-safe — no component imports. Adding a game: add its slug to GameSlug
// and its row to GAMES; the compiler then requires its entry in GAME_CONTENT
// (src/app/games/content, the About copy and SEO fields) and GAME_CLIENT
// (src/components/game/registry.tsx, the banner and renderer), and tests fail
// until GAMES, GAME_CONTENT and GAME_CLIENT list the same slugs.

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
  // The one game the /games hub leads with. Exactly one public game carries
  // it (games-meta.test.ts pins that); the hub reads the flag, so the order of
  // GAMES never has to double as "which game is featured".
  featured?: true;
}

export const GAMES: GameMeta[] = [
  {
    slug: "space-shooter",
    title: "Orbital Dodge",
    tagline: "Thread the asteroid belt in 3D",
    description:
      "3D ship shooter. Steer with mouse, touch, WASD or the arrow keys, and double-tap to dash. Auto-fire breaks asteroids; dodge the rest, grab coins, and unlock ships and upgrades in the shop after your first run.",
    controls:
      "Mouse / touch / WASD / arrows to move. Double-tap to dash. Bullets fire automatically.",
    accent: "#22d3ee",
    accentTailwind: "accent-blue",
    featured: true,
  },
  {
    slug: "hextris",
    title: "Hextris",
    tagline: "Rotate the hex, match three, don't let it overflow",
    description:
      "Rotate the central hexagon to catch falling colored blocks. Match three or more connected blocks of one color to clear them, chain clears into combos, and keep every side under the limit as it tightens.",
    controls: "Arrow keys or A/D to rotate, or tap the left or right half. Match 3 to clear.",
    accent: "#a78bfa",
    accentTailwind: "purple-400",
  },
  {
    slug: "tower-stacker",
    title: "Tower Stacker",
    tagline: "Time the drop, keep the tower wide",
    description:
      "A blueprint-style stacker. A crane swings a block overhead; tap to drop it and the overhang is sliced away. Land dead centre to keep your width. One full miss ends the run. How tall can you build?",
    controls: "Click, tap, Space or Enter to drop the block.",
    accent: "#f87171",
    accentTailwind: "accent-red",
    hidden: true,
  },
  {
    slug: "typing-speed",
    title: "Typing Speed",
    tagline: "Race the clock through flowing sentences",
    description:
      "Passages from classic books, honest net and raw WPM, and animated feedback with streak bursts. Built to feel punchy: every correct letter has a little pop.",
    controls:
      "Click Start or press any key, then type the passage. The clock starts on your first key.",
    accent: "#60a5fa",
    accentTailwind: "accent-blue",
  },
  {
    slug: "super-voltorb-flip",
    title: "Super Voltorb Flip",
    tagline: "Flip tiles, deduce, don't pop the bomb",
    description:
      "A fan recreation of the HGSS Pokémon Game Corner classic. Flip tiles to collect multipliers, use the row and column clues to deduce where Voltorbs hide, and climb 8 levels.",
    controls:
      "Click or tap tiles to flip. Use the memo buttons to mark what a tile could be, and Undo to take a mark back. On a keyboard, use the arrow keys, Enter, and 1, 2, 3 or V.",
    accent: "#fbbf24",
    accentTailwind: "accent-amber",
  },
  {
    slug: "password-game",
    title: "The Password Game 2",
    tagline: "The form fights back",
    description:
      "A five-act sign-up form from hell. Rules stack, creatures move in, fleets invade, and everything you keep alive fights beside you at the finale. Every run is seeded; race the daily.",
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
