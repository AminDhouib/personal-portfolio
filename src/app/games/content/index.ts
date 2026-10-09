import type { GameSlug } from "../games-meta";
import { hextrisContent } from "./hextris";
import { passwordGameContent } from "./password-game";
import { scriptKnightContent } from "./script-knight";
import { spaceShooterContent } from "./space-shooter";
import { superVoltorbFlipContent } from "./super-voltorb-flip";
import { towerStackerContent } from "./tower-stacker";
import { typingSpeedContent } from "./typing-speed";
import type { GameContent } from "./types";

// One entry per GameSlug: a game without its About copy does not compile.
// Update a game's entry in the same change as any behavior it describes.
export const GAME_CONTENT: Record<GameSlug, GameContent> = {
  "space-shooter": spaceShooterContent,
  hextris: hextrisContent,
  "tower-stacker": towerStackerContent,
  "typing-speed": typingSpeedContent,
  "super-voltorb-flip": superVoltorbFlipContent,
  "password-game": passwordGameContent,
  "script-knight": scriptKnightContent,
};
