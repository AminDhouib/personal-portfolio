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
});
