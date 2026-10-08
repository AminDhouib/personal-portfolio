import { describe, it, expect } from "vitest";
import { canvasLayout } from "../canvas-layout";

describe("canvasLayout", () => {
  it("keeps the home embed at 460 px and a 70vh cap", () => {
    const layout = canvasLayout("embed", false);
    expect(layout.sizeClass).toContain("sm:h-115");
    expect(layout.maxHeight).toBe("70vh");
  });

  it("makes the game page min(78vh, 720px) with a 78vh cap", () => {
    const layout = canvasLayout("page", false);
    expect(layout.sizeClass).toContain("sm:h-[min(78vh,720px)]");
    expect(layout.maxHeight).toBe("78vh");
  });

  it("fills the screen in fullscreen for either variant", () => {
    for (const variant of ["embed", "page"] as const) {
      const layout = canvasLayout(variant, true);
      expect(layout.sizeClass).toContain("fixed inset-0");
      expect(layout.maxHeight).toBe("100vh");
    }
  });
});
