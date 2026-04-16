import type { ThemeId } from "./types";

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
  },
  meadow: {
    id: "meadow",
    name: "Starter's Meadow",
    description: "Soft green meadow with wooden tile frames. A warm early-game vibe.",
    cost: 2500,
    bgUrl: `linear-gradient(180deg, #c8e88a 0%, #8fbf5a 100%)`,
    bgmUrl: `${ASSETS}/music/theme-meadow.mp3`,
    overlay: "meadow-grass-pattern",
  },
  twilight: {
    id: "twilight",
    name: "Twilight Route",
    description: "Orange-pink sunset, silhouetted trees in the distance.",
    cost: 5000,
    bgUrl: `linear-gradient(180deg, #ff9966 0%, #ff5e8a 60%, #6a2c70 100%)`,
    bgmUrl: `${ASSETS}/music/theme-twilight.mp3`,
    overlay: "twilight-silhouette",
  },
};

export const DEFAULT_THEME: ThemeId = "classic";
export const THEME_ORDER: ThemeId[] = ["classic", "meadow", "twilight"];
