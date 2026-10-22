import { describe, it, expect } from "vitest";
import { sanitizePlayerName } from "../player-name";

// Every exotic character below is written as a \u escape, never a literal
// byte -- raw control bytes make grep classify the file as binary (pass-1
// incident, commit ae32d5c).
const OPTS = { maxLength: 12, fallback: "Pilot" };

describe("sanitizePlayerName", () => {
  it("returns the fallback for non-string input", () => {
    expect(sanitizePlayerName(42, OPTS)).toBe("Pilot");
    expect(sanitizePlayerName(undefined, OPTS)).toBe("Pilot");
    expect(sanitizePlayerName(null, OPTS)).toBe("Pilot");
  });

  it("strips C0 control characters", () => {
    expect(sanitizePlayerName("Ada\u0000\u001f", OPTS)).toBe("Ada");
  });

  it("strips DEL and C1 control characters", () => {
    expect(sanitizePlayerName("Ada\u007f\u0080\u009f", OPTS)).toBe("Ada");
  });

  it("strips zero-width characters and the BOM", () => {
    expect(sanitizePlayerName("A\u200bd\u200da\ufeff", OPTS)).toBe("Ada");
    expect(sanitizePlayerName("A\u2060da\u2064", OPTS)).toBe("Ada");
  });

  it("strips bidi override and isolate controls (board-spoofing guard)", () => {
    expect(sanitizePlayerName("\u202eAda\u202c", OPTS)).toBe("Ada");
    expect(sanitizePlayerName("\u2066Ada\u2069", OPTS)).toBe("Ada");
    expect(sanitizePlayerName("\u200fAda\u200e", OPTS)).toBe("Ada");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizePlayerName("  Ada  ", OPTS)).toBe("Ada");
  });

  it("slices to maxLength", () => {
    expect(sanitizePlayerName("A".repeat(20), OPTS)).toBe("A".repeat(12));
  });

  it("returns the fallback when the cleaned result is empty", () => {
    expect(sanitizePlayerName("   ", OPTS)).toBe("Pilot");
    expect(sanitizePlayerName(" \u200b\u202e", OPTS)).toBe("Pilot");
  });

  it("keeps ordinary unicode names intact", () => {
    expect(sanitizePlayerName("Amin", OPTS)).toBe("Amin");
    expect(sanitizePlayerName("Am\u00e9lie", OPTS)).toBe("Am\u00e9lie");
  });

  // T-6413, pinned before the change: ordinary names pass through untouched, so widening the
  // stripped set cannot quietly eat something people really type.
  describe("keeps ordinary names exactly as typed", () => {
    it.each([
      ["accented Latin", "Am\u00e9lie Dupont-\u00c7a"],
      ["CJK", "\u5c71\u7530\u592a\u90ce"],
      ["Hangul syllables", "\ud55c\uad6d\uc5b4"],
      ["Hiragana and katakana", "\u3072\u3089\u304c\u306a\u30ab\u30bf\u30ab\u30ca"],
      ["Cyrillic", "\u0410\u043b\u0435\u043a\u0441\u0435\u0439"],
      ["Arabic", "\u0645\u062d\u0645\u062f"],
      ["punctuation", "O'Brien, J.R.!"],
      ["inner spaces", "Ada  Lovelace"],
      ["digits and symbols", "p4ss_w0rd#1"],
      ["a Braille letter that is not the blank pattern", "\u2801\u2803"],
      ["a Hangul syllable next to the filler's neighbours", "\uac00\ub098"],
    ])("%s", (_label, name) => {
      expect(sanitizePlayerName(name, { maxLength: 16, fallback: "Pilot" })).toBe(name);
    });

    it("keeps an emoji and the variation selector that selects its emoji presentation", () => {
      const heart = "I \u2764\ufe0f U";
      expect(sanitizePlayerName(heart, { maxLength: 16, fallback: "Pilot" })).toBe(heart);
      const keycap = "1\ufe0f\u20e3";
      expect(sanitizePlayerName(keycap, { maxLength: 16, fallback: "Pilot" })).toBe(keycap);
    });
  });

  describe("how an empty name is handled today", () => {
    it.each([
      ["empty", ""],
      ["spaces", "   "],
      ["tab and newline", "\t\n"],
      ["no-break and ideographic spaces", "\u00a0\u3000"],
      ["line and paragraph separators", "\u2028\u2029"],
      ["en and em spaces", "\u2002\u2003\u2009"],
      ["already-stripped invisibles", "\u200b\u2060\u2064\ufeff\u202e"],
    ])("%s gives the caller's fallback", (_label, name) => {
      expect(sanitizePlayerName(name, { maxLength: 16, fallback: "Pilot" })).toBe("Pilot");
      expect(sanitizePlayerName(name, { maxLength: 16, fallback: "Anonymous" })).toBe("Anonymous");
    });

    it("applies the length cut before it decides a name is empty", () => {
      // 20 spaces then a letter: trim removes the leading run, so the letter survives the cut.
      expect(sanitizePlayerName(" ".repeat(20) + "A", { maxLength: 4, fallback: "Pilot" })).toBe(
        "A",
      );
    });
  });
});
