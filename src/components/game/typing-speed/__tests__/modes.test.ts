// @vitest-environment node
import { describe, expect, it } from "vitest";
import { dailyText } from "../engine/daily";
import { DEFAULT_MODE, MODE_IDS, configFor, isModeId, modeLabel, parseMode } from "../engine/modes";

describe("modes", () => {
  it("lists the eight timed modes, the single quote and the daily", () => {
    expect(MODE_IDS).toEqual([
      "words-15",
      "words-30",
      "words-60",
      "words-120",
      "quotes-15",
      "quotes-30",
      "quotes-60",
      "quotes-120",
      "quote",
      "daily",
    ]);
    expect(DEFAULT_MODE).toBe("words-30");
  });
  it("maps a timed mode to a time config with its seconds, content and seed", () => {
    expect(configFor("quotes-60", 9)).toEqual({
      kind: "time",
      seconds: 60,
      content: "quotes",
      seed: 9,
    });
  });
  it("maps quote to a text run of the passage the seed picks", () => {
    const c = configFor("quote", 9);
    expect(c.kind).toBe("text");
  });
  it("maps daily to a text run of that day's text, whatever the seed", () => {
    const text = dailyText("2026-10-08").text;
    expect(configFor("daily", 9, 0, "2026-10-08")).toEqual({ kind: "text", text });
    expect(configFor("daily", 1234, 3, "2026-10-08")).toEqual({ kind: "text", text });
    expect(parseMode("daily")).toBeNull();
  });
  it("rejects anything else", () => {
    for (const x of ["words-45", "daily-2", "", null, 3]) expect(isModeId(x)).toBe(false);
    for (const id of MODE_IDS) expect(isModeId(id)).toBe(true);
  });
  it("labels are short and ASCII", () => {
    expect(modeLabel("words-120")).toBe("120s words");
    expect(modeLabel("quotes-15")).toBe("15s quotes");
    expect(modeLabel("quote")).toBe("Quote");
    expect(modeLabel("daily")).toBe("Daily");
  });
});
