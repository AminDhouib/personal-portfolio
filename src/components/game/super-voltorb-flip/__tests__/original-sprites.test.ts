import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeImage {
  static all: FakeImage[] = [];
  src = "";
  constructor() {
    FakeImage.all.push(this);
  }
}

beforeEach(() => {
  FakeImage.all = [];
  vi.stubGlobal("Image", FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// The preload list is module state, so each test loads a fresh copy.
async function load() {
  vi.resetModules();
  return await import("../art/original-sprites");
}

describe("preloadOriginalSprites", () => {
  it("creates the tile, the icon and the nine burst frames", async () => {
    const { preloadOriginalSprites, VOLTORB_TILE_SRC, VOLTORB_ICON_SRC, EXPLODE_FRAME_SRCS } =
      await load();
    preloadOriginalSprites();
    expect(FakeImage.all.map((img) => img.src)).toEqual([
      VOLTORB_TILE_SRC,
      VOLTORB_ICON_SRC,
      ...EXPLODE_FRAME_SRCS,
    ]);
  });

  it("creates the images only once, however many times it is called", async () => {
    const { preloadOriginalSprites } = await load();
    preloadOriginalSprites();
    const count = FakeImage.all.length;
    preloadOriginalSprites();
    preloadOriginalSprites();
    expect(count).toBe(11);
    expect(FakeImage.all).toHaveLength(count);
  });

  it("does nothing where there is no Image", async () => {
    vi.stubGlobal("Image", undefined);
    const { preloadOriginalSprites } = await load();
    expect(() => preloadOriginalSprites()).not.toThrow();
    expect(FakeImage.all).toHaveLength(0);
  });
});
