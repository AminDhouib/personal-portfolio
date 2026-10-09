import { describe, expect, it } from "vitest";

import { CODE_COLORS } from "../code-editor";
import { GAME_SURFACE, SURFACE_COLORS } from "../surface";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe("the CodeMirror theme", () => {
  it("sits on the same fixed dark surface as the textarea and the rest of the game", () => {
    expect(GAME_SURFACE).toContain(`bg-[${SURFACE_COLORS.background}]`);
    expect(GAME_SURFACE).toContain(`text-[${SURFACE_COLORS.text}]`);
    expect(GAME_SURFACE).toContain(`--foreground:${SURFACE_COLORS.text}`);
    expect(GAME_SURFACE).toContain(`--muted:${SURFACE_COLORS.muted}`);
    expect(GAME_SURFACE).toContain(`--border:${SURFACE_COLORS.border}`);
    expect(CODE_COLORS.background).toBe(SURFACE_COLORS.background);
    expect(CODE_COLORS.text).toBe(SURFACE_COLORS.text);
  });

  it("draws every code colour, and the line numbers and error mark, at 4.5:1 or better", () => {
    for (const [name, colour] of Object.entries(CODE_COLORS)) {
      if (name === "background") continue;
      expect(
        contrast(colour, SURFACE_COLORS.background),
        `${name} ${colour} on ${SURFACE_COLORS.background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
