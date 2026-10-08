// Stage sizing for Tower Stacker. Pure: the stage component feeds it the measured
// column width and the viewport height, the painter and pointer code read the scale.
import { WORLD_WIDTH } from "./engine";

export interface StageLayout {
  cssWidth: number;
  cssHeight: number;
  /** CSS pixels per world unit. */
  scale: number;
}

const MIN_WIDTH = 280;
const MAX_WIDTH = 440;
const MIN_HEIGHT = 420;
/** Page chrome kept clear above and below the stage in the page column. */
const PAGE_CHROME = 200;

export function stageLayout(input: {
  containerWidth: number;
  viewportHeight: number;
  /** True in the phone play sheet, where the stage takes the whole screen. */
  sheet: boolean;
}): StageLayout {
  if (input.sheet) {
    const cssWidth = Math.round(input.containerWidth);
    return {
      cssWidth,
      cssHeight: Math.round(input.viewportHeight),
      scale: cssWidth / WORLD_WIDTH,
    };
  }
  const cssWidth = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, input.containerWidth)));
  const cssHeight = Math.min(
    Math.round(cssWidth * 1.5),
    Math.max(MIN_HEIGHT, input.viewportHeight - PAGE_CHROME),
  );
  return { cssWidth, cssHeight, scale: cssWidth / WORLD_WIDTH };
}
