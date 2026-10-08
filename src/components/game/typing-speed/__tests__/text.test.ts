// @vitest-environment node
import { describe, expect, it } from "vitest";
import { COMMON_WORDS } from "../corpus/words";
import { PASSAGES } from "../corpus/passages";
import { passageAt, splitWords, wordAt } from "../engine/text";

describe("wordAt", () => {
  it("is deterministic per seed and index, and only yields common words", () => {
    const a = Array.from({ length: 200 }, (_, i) => wordAt(42, i));
    const b = Array.from({ length: 200 }, (_, i) => wordAt(42, i));
    expect(a).toEqual(b);
    for (const w of a) expect(COMMON_WORDS).toContain(w);
  });
  it("differs between seeds and never repeats a word twice in a row", () => {
    const a = Array.from({ length: 200 }, (_, i) => wordAt(1, i));
    const b = Array.from({ length: 200 }, (_, i) => wordAt(2, i));
    expect(a).not.toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i]).not.toBe(a[i - 1]);
  });
});

describe("passageAt", () => {
  it("walks a seeded permutation: no repeat until every passage was used", () => {
    const seen = new Set(Array.from({ length: PASSAGES.length }, (_, i) => passageAt(9, i).id));
    expect(seen.size).toBe(PASSAGES.length);
  });
});

describe("splitWords", () => {
  it("splits on single spaces and keeps punctuation on its word", () => {
    expect(splitWords("Call me Ishmael. Some years ago")).toEqual([
      "Call",
      "me",
      "Ishmael.",
      "Some",
      "years",
      "ago",
    ]);
  });
});
