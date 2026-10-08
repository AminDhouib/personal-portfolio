import { describe, expect, it } from "vitest";
import { HUD_PX, PADDING_PX, sheetLayout } from "../sheet-layout";

describe("sheetLayout", () => {
  it("shows the graph only on a tall sheet with the keyboard closed", () => {
    expect(sheetLayout({ vvHeight: 844, keyboardOpen: false }).showGraph).toBe(true);
    expect(sheetLayout({ vvHeight: 560, keyboardOpen: false }).showGraph).toBe(true);
    expect(sheetLayout({ vvHeight: 559, keyboardOpen: false }).showGraph).toBe(false);
    expect(sheetLayout({ vvHeight: 844, keyboardOpen: true }).showGraph).toBe(false);
  });

  it("steps the font down from 22 to 18 px below 420 px", () => {
    expect(sheetLayout({ vvHeight: 420, keyboardOpen: true }).fontPx).toBe(22);
    expect(sheetLayout({ vvHeight: 419, keyboardOpen: true }).fontPx).toBe(18);
  });

  it("derives the line height from the font", () => {
    expect(sheetLayout({ vvHeight: 844, keyboardOpen: false }).lineHeightPx).toBe(36);
    expect(sheetLayout({ vvHeight: 300, keyboardOpen: true }).lineHeightPx).toBe(30);
  });

  it("fits the HUD and three text lines at every height from 280 to 900", () => {
    for (let vvHeight = 280; vvHeight <= 900; vvHeight++) {
      for (const keyboardOpen of [false, true]) {
        const { lineHeightPx } = sheetLayout({ vvHeight, keyboardOpen });
        expect(HUD_PX + 3 * lineHeightPx + PADDING_PX).toBeLessThanOrEqual(vvHeight);
      }
    }
  });
});
