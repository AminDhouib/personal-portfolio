export type CanvasVariant = "embed" | "page";

/**
 * The line under the canvas. Shared with the home section's placeholder, which renders it before
 * the game chunk loads so the swap does not move the page.
 */
export const SHOOTER_CAPTION =
  "Endless run. Pick up power-ups for temporary firepower or shield. Biome shifts every 35s — and the asteroids get meaner the longer you survive.";

/**
 * Sizing for the game canvas. The home embed keeps a fixed 460 px desktop height; the dedicated
 * game page is taller, min(78vh, 720px), so the playfield is not a letterbox on a laptop.
 * Fullscreen fills the screen for both.
 */
export function canvasLayout(variant: CanvasVariant, isFullscreen: boolean) {
  if (isFullscreen) {
    return {
      sizeClass: "fixed inset-0 z-50 h-screen w-screen rounded-none border-0",
      maxHeight: "100vh",
    };
  }
  if (variant === "page") {
    return {
      sizeClass: "aspect-3/4 w-full sm:aspect-auto sm:h-[min(78vh,720px)]",
      maxHeight: "78vh",
    };
  }
  return { sizeClass: "aspect-3/4 w-full sm:aspect-auto sm:h-115", maxHeight: "70vh" };
}
