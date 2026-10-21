import { describe, it, expect } from "vitest";
import { translations } from "../translations";

describe("instructions copy", () => {
  it("keeps both languages the same shape", () => {
    expect(translations["pt-BR"].instructions).toHaveLength(translations.en.instructions.length);
    expect(translations["pt-BR"].tips).toHaveLength(translations.en.tips.length);
  });
  it("pins the English headings and the eight-level rule", () => {
    expect(translations.en.howToPlayTitle).toBe("How to play");
    expect(translations.en.tipsTitle).toBe("Tips:");
    expect(translations.en.instructions.join(" ")).toContain("There are 8 Levels.");
  });
});
