/** Height of the sheet's one-row HUD (time, WPM, Restart, Exit), buttons included. */
export const HUD_PX = 56;
/** Vertical padding around the text window inside the sheet. */
export const PADDING_PX = 24;

const GRAPH_MIN_PX = 560;
const SMALL_VIEWPORT_PX = 420;
/** The text view is three lines of leading-relaxed, which is 1.625em each. */
const LINE_HEIGHT_EM = 1.625;

export interface SheetLayout {
  showGraph: boolean;
  lineHeightPx: number;
  fontPx: number;
}

/** Sizes the phone sheet's text and decides what fits above the on-screen keyboard. */
export function sheetLayout(i: { vvHeight: number; keyboardOpen: boolean }): SheetLayout {
  const fontPx = i.vvHeight < SMALL_VIEWPORT_PX ? 18 : 22;
  return {
    showGraph: !i.keyboardOpen && i.vvHeight >= GRAPH_MIN_PX,
    lineHeightPx: Math.ceil(fontPx * LINE_HEIGHT_EM),
    fontPx,
  };
}
