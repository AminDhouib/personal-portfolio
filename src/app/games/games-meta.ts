// Game registry. Single source of truth for slugs, titles, blurbs, and accent
// colors. Server-safe — contains no component imports. Game components and
// banners are resolved client-side via games-registry.tsx.

export type GameSlug =
  | "space-shooter"
  | "hextris"
  | "tower-stacker"
  | "geometric-flow"
  | "typing-speed"
  | "code-puzzle"
  | "super-voltorb-flip"
  | "password-game";

export interface GameMeta {
  slug: GameSlug;
  title: string;
  tagline: string;          // short neal.fun-style hook for the banner
  description: string;      // long copy on the game page
  controls?: string;
  accent: string;           // hex used for banner gradient + glow
  accentTailwind: string;   // tailwind class fragment (e.g. "accent-green")
  external?: true;          // password-game has its own top-level route
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
    tagline: "Stack blocks, miss a sliver, lose width",
    description:
      "Classic timing stacker. A block slides back and forth — tap to drop it. Overhang gets trimmed; perfect stacks keep your width. How tall can you build?",
    controls: "Click or tap anywhere to drop the block.",
    accent: "#f87171",
    accentTailwind: "accent-red",
  },
  {
    slug: "geometric-flow",
    title: "Geometric Flow",
    tagline: "Endless wireframe dodge runner",
    description:
      "Navigate a green triangle through a field of wireframe shapes. Three lanes, one tap to switch. Speed ramps up forever.",
    controls: "Click or tap anywhere to switch lanes.",
    accent: "#f472b6",
    accentTailwind: "accent-pink",
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
    slug: "code-puzzle",
    title: "Code Puzzle",
    tagline: "Spot the bug in six real-world snippets",
    description:
      "Six multiple-choice bugs ranging from JavaScript gotchas to SQL injection. Instant explanation after every pick.",
    controls: "Read the code, pick the buggy line.",
    accent: "#fbbf24",
    accentTailwind: "accent-amber",
  },
  {
    slug: "super-voltorb-flip",
    title: "Super Voltorb Flip",
    tagline: "Flip tiles, deduce, don't pop the bomb",
    description:
      "A faithful recreation of the HGSS classic with modern upgrades. Flip tiles for coins, use row/column clues to avoid Voltorbs, spend coins on shields & reveals.",
    controls: "Click tiles to flip. Toggle memo mode to mark possibilities.",
    accent: "#fbbf24",
    accentTailwind: "accent-amber",
  },
  {
    slug: "password-game",
    title: "Password Game 2",
    tagline: "Seeded chaos — every run is a new disaster",
    description:
      "Sequel to the original Password Game with seeded rules, time pressure, and rule-tier escalation. Every seed is shareable and deterministic.",
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
