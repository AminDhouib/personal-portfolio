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
    expect(meta?.description).not.toContain(String.fromCharCode(0x2014));
  });
  it("describes the daily text and its board, in plain ASCII, and no longer says none", () => {
    expect(typingSpeedContent.intro).toMatch(/Daily/);
    expect(typingSpeedContent.howToPlay.join(" ")).toMatch(/Post/);
    const board = typingSpeedContent.facts.find((f) => f.label === "Leaderboard");
    expect(board?.value).toMatch(/daily text/i);
    expect(board?.value).toMatch(/UTC/);
    const questions = typingSpeedContent.faq.map((f) => f.question);
    expect(questions).toContain("What is the daily text?");
    const faq = typingSpeedContent.faq.map((f) => f.answer).join(" ");
    expect(faq).toMatch(/00:00 to 24:00 UTC/);
    expect(faq).toMatch(/cannot be posted/);
    expect(faq).not.toMatch(/no leaderboard/i);
    expect([...all].every((ch) => (ch.codePointAt(0) ?? 0) < 128)).toBe(true);
  });
  it("explains the ghost: your own best, local only, per mode, with an off switch", () => {
    expect(typingSpeedContent.intro).toMatch(/ghost/);
    expect(typingSpeedContent.howToPlay.join(" ")).toMatch(/ghost/i);
    const faq = typingSpeedContent.faq.find((f) => f.question === "What is the ghost?");
    expect(faq?.answer).toMatch(/best run/);
    expect(faq?.answer).toMatch(/only in your browser/);
    expect(faq?.answer).toMatch(/one per mode/);
    expect(faq?.answer).toMatch(/Ghost button turns it off/);
    const progress = typingSpeedContent.facts.find((f) => f.label === "Progress");
    expect(progress?.value).toMatch(/ghost/);
  });
  it("describes the phone sheet: text above the keyboard, tap the text to come back", () => {
    const phone = typingSpeedContent.controls.find((c) => c.input === "Phone");
    expect(phone?.action).toMatch(/above the keyboard/);
    expect(phone?.action).toMatch(/tap the text/i);
    const fact = typingSpeedContent.facts.find((f) => f.label === "Phones");
    expect(fact?.value).toMatch(/above the keyboard/);
  });
  it("carries the Word Rain tagline, and the copy says how the falling-words mode plays", () => {
    const meta = GAMES.find((g) => g.slug === "typing-speed");
    expect(meta?.tagline).toBe("Race the clock, chase your ghost, stop the falling words");
    expect(meta?.description).toMatch(/falling words/);
    expect(typingSpeedContent.seoDescription).toMatch(/falling-words|Word Rain/);
    expect(typingSpeedContent.intro).toMatch(/Word Rain/);
    const how = typingSpeedContent.howToPlay.join(" ");
    expect(how).toMatch(/Rain/);
    expect(how).toMatch(/three lives/);
    expect(how).toMatch(/wave/);
    const control = typingSpeedContent.controls.find((c) => c.input === "Word Rain");
    expect(control?.action).toMatch(/above the keyboard/);
    const modes = typingSpeedContent.facts.find((f) => f.label === "Modes");
    expect(modes?.value).toMatch(/Word Rain/);
    const saves = typingSpeedContent.faq.find((f) => f.question.startsWith("Does the typing game"));
    expect(saves?.answer).toMatch(/Word Rain/);
    expect(saves?.answer).toMatch(/no leaderboard|Only the Daily/i);
  });
});
