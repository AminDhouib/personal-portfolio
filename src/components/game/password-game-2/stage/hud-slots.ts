import type { RectLike, StageLayout } from "./painters";

/** Heights of the reserved HUD bands above and below the password box (CSS px). */
export const HUD_TOP_H = 56;
export const HUD_BOTTOM_H = 48;
const METER_FRACTION = 0.55;

export interface HudSlots {
  top: RectLike;
  bottom: RectLike;
  meter: RectLike; // left part of the top band: crisis meters (hive, hunger)
  chips: RectLike; // right part of the top band: action chips
}

/**
 * The reserved HUD bands, derived from the measured password box. Painters draw
 * meters only inside these rects, so nothing HUD-like ever lands on the password.
 */
export function hudSlots(layout: Pick<StageLayout, "boxRect">): HudSlots | null {
  const b = layout.boxRect;
  if (b === null) return null;
  const top = { x: b.x, y: b.y - HUD_TOP_H, w: b.w, h: HUD_TOP_H };
  const bottom = { x: b.x, y: b.y + b.h, w: b.w, h: HUD_BOTTOM_H };
  const meterW = Math.round(b.w * METER_FRACTION);
  return {
    top,
    bottom,
    meter: { x: top.x, y: top.y, w: meterW, h: top.h },
    chips: { x: top.x + meterW, y: top.y, w: top.w - meterW, h: top.h },
  };
}
