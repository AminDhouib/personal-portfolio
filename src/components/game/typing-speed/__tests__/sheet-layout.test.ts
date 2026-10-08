import { describe, expect, it } from "vitest";
import { HUD_PX, contentPx, sheetLayout } from "../sheet-layout";

describe("sheetLayout", () => {
  it("shows the graph only on a tall sheet with the keyboard closed", () => {
    expect(sheetLayout({ vvHeight: 844, keyboardOpen: false }).showGraph).toBe(true);
    expect(sheetLayout({ vvHeight: 560, keyboardOpen: false }).showGraph).toBe(true);
    expect(sheetLayout({ vvHeight: 559, keyboardOpen: false }).showGraph).toBe(false);
    expect(sheetLayout({ vvHeight: 844, keyboardOpen: true }).showGraph).toBe(false);
  });

  it("steps the font down 22, 18, 14 px as the sheet gets shorter", () => {
    expect(sheetLayout({ vvHeight: 420, keyboardOpen: true }).fontPx).toBe(22);
    expect(sheetLayout({ vvHeight: 419, keyboardOpen: true }).fontPx).toBe(18);
    expect(sheetLayout({ vvHeight: 230, keyboardOpen: true }).fontPx).toBe(18);
    expect(sheetLayout({ vvHeight: 229, keyboardOpen: true }).fontPx).toBe(14);
  });

  it("goes compact only on the shortest sheets", () => {
    expect(sheetLayout({ vvHeight: 230, keyboardOpen: true }).compact).toBe(false);
    expect(sheetLayout({ vvHeight: 229, keyboardOpen: true }).compact).toBe(true);
  });

  it("uses the rendered HUD height: pt-1 plus a 44 px button", () => {
    expect(HUD_PX).toBe(48);
  });

  it("fits the HUD and the whole three-line text box from 160 px (landscape, keyboard up) to 900", () => {
    for (let vvHeight = 160; vvHeight <= 900; vvHeight++) {
      for (const keyboardOpen of [false, true]) {
        const layout = sheetLayout({ vvHeight, keyboardOpen });
        expect(contentPx(layout)).toBeLessThanOrEqual(vvHeight);
      }
    }
  });
});
