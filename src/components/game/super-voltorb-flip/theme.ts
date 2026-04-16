import type { ThemeId } from "./types";

export type ThemeLabels = {
  totalScoreboard: [string, string]; // two lines
  currentScoreboard: [string, string];
  headerTitle: string;               // shown before the level digit, e.g. "VOLTORB Flip Lv."
  headerSubtitle: string;            // second row of the header banner
  voltorbMessage: string;            // right-of-voltorb-icon tagline
  legendMultipliers: string;         // right-of-1/2/3-boxes, e.g. "...x1! ...x2! ...x3!"
};

export type ThemeDef = {
  id: ThemeId;
  name: string;
  description: string;
  cost: number;
  bgUrl: string;
  bgmUrl: string;
  overlay?: string;
  tilePalette?: {
    blank?: string;
  };
  labels: ThemeLabels;
};

const ASSETS = "/games/super-voltorb-flip";

export const THEMES: Record<ThemeId, ThemeDef> = {
  classic: {
    id: "classic",
    name: "Game Corner Classic",
    description: "The faithful HGSS recreation. Green DS background, pixel tiles.",
    cost: 0,
    bgUrl: `linear-gradient(180deg, #5ab859 0%, #3f8a3f 100%)`,
    bgmUrl: `${ASSETS}/music/theme-classic.mp3`,
    labels: {
      totalScoreboard: ["Total", "Collected Coins"],
      currentScoreboard: ["Coins Collected in", "Current Game"],
      headerTitle: "VOLTORB Flip Lv.",
      headerSubtitle: "Flip the Cards and Collect Coins!",
      voltorbMessage: "Game Over! 0!",
      legendMultipliers: "...x1! ...x2! ...x3!",
    },
  },
  meadow: {
    id: "meadow",
    name: "Starter's Meadow",
    description: "Soft green meadow with wooden tile frames. A warm early-game vibe.",
    cost: 2500,
    bgUrl: `linear-gradient(180deg, #c8e88a 0%, #8fbf5a 100%)`,
    bgmUrl: `${ASSETS}/music/theme-meadow.mp3`,
    overlay: "meadow-grass-pattern",
    labels: {
      totalScoreboard: ["Meadow", "Fortune"],
      currentScoreboard: ["This", "Meadow Run"],
      headerTitle: "MEADOW Flip Lv.",
      headerSubtitle: "Flip through the tall grass!",
      voltorbMessage: "Pollen burst! Run over.",
      legendMultipliers: "leaf x1 bud x2 flower x3",
    },
  },
  twilight: {
    id: "twilight",
    name: "Twilight Route",
    description: "Orange-pink sunset, silhouetted trees in the distance.",
    cost: 5000,
    bgUrl: `linear-gradient(180deg, #ff9966 0%, #ff5e8a 60%, #6a2c70 100%)`,
    bgmUrl: `${ASSETS}/music/theme-twilight.mp3`,
    overlay: "twilight-silhouette",
    labels: {
      totalScoreboard: ["Twilight", "Hoard"],
      currentScoreboard: ["Evening's", "Haul"],
      headerTitle: "TWILIGHT Flip Lv.",
      headerSubtitle: "Sunset gambit — play before nightfall.",
      voltorbMessage: "Dusk bomb! Round lost.",
      legendMultipliers: "dawn x1 dusk x2 night x3",
    },
  },
};

export const DEFAULT_THEME: ThemeId = "classic";
export const THEME_ORDER: ThemeId[] = ["classic", "meadow", "twilight"];
