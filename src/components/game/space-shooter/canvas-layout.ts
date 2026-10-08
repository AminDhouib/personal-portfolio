export type CanvasVariant = "embed" | "page";

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
