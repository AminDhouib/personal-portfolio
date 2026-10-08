/** Height of the sheet's one-row HUD: pt-1 (4 px) above a 44 px button. */
export const HUD_PX = 48;

const GRAPH_MIN_PX = 560;
const SMALL_VIEWPORT_PX = 420;
/** Below this (a phone in landscape with the keyboard up) the sheet squeezes its padding too. */
const COMPACT_VIEWPORT_PX = 230;
/** The text view is three lines of leading-relaxed, a box 4.875em tall. */
const TEXT_BOX_EM = 4.875;

export interface SheetLayout {
  showGraph: boolean;
  fontPx: number;
  /** Tighter gaps and padding, for the shortest sheets. */
  compact: boolean;
}

/** Sizes the phone sheet's text and decides what fits above the on-screen keyboard. */
export function sheetLayout(i: { vvHeight: number; keyboardOpen: boolean }): SheetLayout {
  const compact = i.vvHeight < COMPACT_VIEWPORT_PX;
  return {
    showGraph: !i.keyboardOpen && i.vvHeight >= GRAPH_MIN_PX,
    fontPx: compact ? 14 : i.vvHeight < SMALL_VIEWPORT_PX ? 18 : 22,
    compact,
  };
}

/**
 * The sheet's content height without the graph slot: the HUD, the gap, the text box (its
 * borders and padding included) and the bottom padding, matching play-sheet.tsx and the
 * passage container in typing-speed.tsx.
 */
export function contentPx(layout: SheetLayout): number {
  const gap = layout.compact ? 4 : 8;
  const boxChrome = layout.compact ? 2 + 12 : 2 + 24;
  const bottom = layout.compact ? 4 : 12;
  return Math.ceil(HUD_PX + gap + TEXT_BOX_EM * layout.fontPx + boxChrome + bottom);
}
