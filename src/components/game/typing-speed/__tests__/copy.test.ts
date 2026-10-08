// @vitest-environment node
import { describe, expect, it } from "vitest";
import { typingSpeedContent } from "@/app/games/content/typing-speed";
import { GAMES } from "@/app/games/games-meta";
import { PASSAGES } from "../corpus/passages";
import { SOURCES } from "../corpus/sources";

const all = JSON.stringify(typingSpeedContent);

describe("Typing Speed copy describes the engine", () => {
  it("no longer claims the retired in-repo sentence list", () => {
    expect(all).not.toMatch(/25 built in|25 sentences|Next sentence/);
  });
  it("states the passage and source counts it really ships", () => {
    expect(PASSAGES.length).toBeGreaterThanOrEqual(100);
    expect(all).toContain(`${SOURCES.length} public-domain books`);
    expect(all).toMatch(/100\+ from 18/);
  });
  it("answers how WPM and accuracy are calculated, and whether paste works", () => {
    const questions = typingSpeedContent.faq.map((f) => f.question).join(" | ");
    expect(questions).toMatch(/WPM/);
    expect(questions).toMatch(/accuracy/);
    expect(questions).toMatch(/paste/i);
    expect(all).toMatch(/net WPM/);
    expect(all).toMatch(/raw WPM/);
  });
  it("credits the passages and points at the NOTICE file", () => {
    const credit = typingSpeedContent.credits.find((c) => c.label === "Passages");
    expect(credit?.detail).toMatch(/public domain/i);
    expect(credit?.href).toMatch(/^https:\/\/.*NOTICE$/);
  });
  it("the game page controls match the new flow", () => {
    const meta = GAMES.find((g) => g.slug === "typing-speed");
    expect(meta?.controls).toMatch(/passage/);
    expect(meta?.description).not.toMatch(/2014/);
  });
});
