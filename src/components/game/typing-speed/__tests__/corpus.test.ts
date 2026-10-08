// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SOURCES, sourceUrl } from "../corpus/sources";
import { PASSAGES } from "../corpus/passages";
import { COMMON_WORDS } from "../corpus/words";

const PASSAGE_CHARS = /^[A-Za-z0-9 .,;:!?'"()-]+$/;

describe("sources", () => {
  it("are public domain under life+100 and US pre-1929 rules", () => {
    for (const s of SOURCES) {
      expect(s.authorDied, s.id).toBeLessThan(1926);
      expect(s.published, s.id).toBeLessThan(1929);
      expect(sourceUrl(s)).toBe(`https://www.gutenberg.org/ebooks/${s.gutenberg}`);
    }
  });
  it("have unique ids and Gutenberg numbers", () => {
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length);
    expect(new Set(SOURCES.map((s) => s.gutenberg)).size).toBe(SOURCES.length);
  });
});

describe("passages", () => {
  it("has at least 100 passages, each from a listed source", () => {
    expect(PASSAGES.length).toBeGreaterThanOrEqual(100);
    const ids = new Set(SOURCES.map((s) => s.id));
    for (const p of PASSAGES) expect(ids.has(p.source), p.id).toBe(true);
  });
  it("uses typeable ASCII only, single spaces, no double hyphen, 60-400 characters", () => {
    for (const p of PASSAGES) {
      expect(p.text, p.id).toMatch(PASSAGE_CHARS);
      expect(p.text, p.id).not.toMatch(/ {2}|--|^ | $/);
      expect(p.text.length, p.id).toBeGreaterThanOrEqual(60);
      expect(p.text.length, p.id).toBeLessThanOrEqual(400);
    }
  });
  it("has unique ids and texts, and every source contributes", () => {
    expect(new Set(PASSAGES.map((p) => p.id)).size).toBe(PASSAGES.length);
    expect(new Set(PASSAGES.map((p) => p.text)).size).toBe(PASSAGES.length);
    for (const s of SOURCES)
      expect(
        PASSAGES.some((p) => p.source === s.id),
        s.id,
      ).toBe(true);
  });
  it("has at least 30 passages in the daily range (180-360 characters)", () => {
    expect(
      PASSAGES.filter((p) => p.text.length >= 180 && p.text.length <= 360).length,
    ).toBeGreaterThanOrEqual(30);
  });
});

describe("common words", () => {
  it("is 500 unique lowercase words", () => {
    expect(COMMON_WORDS).toHaveLength(500);
    expect(new Set(COMMON_WORDS).size).toBe(500);
    for (const w of COMMON_WORDS) expect(w).toMatch(/^[a-z]{1,12}$/);
  });
  it("leaves out archaic forms", () => {
    for (const w of ["thee", "thou", "thy", "thine", "hath", "doth", "ye", "shalt", "unto"]) {
      expect(COMMON_WORDS).not.toContain(w);
    }
  });
});
