/** A visual-viewport shrink at least this big is treated as the on-screen keyboard. */
export const KEYBOARD_MIN_PX = 120;

export interface ViewportLayout {
  keyboardOpen: boolean;
  height: number;
  top: number;
}

/** Pure mapping from visual-viewport readings to the play sheet's height and offset. */
export function computeViewportLayout(i: {
  baselineHeight: number;
  vvHeight: number;
  vvOffsetTop: number;
}): ViewportLayout {
  const height = Math.max(0, i.vvHeight);
  const top = Math.max(0, i.vvOffsetTop);
  return { keyboardOpen: i.baselineHeight - height >= KEYBOARD_MIN_PX, height, top };
}
