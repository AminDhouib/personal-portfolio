// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GAME_CONTENT } from "..";

// What the About copy says has to stay true of the page.
describe("Script Knight About copy", () => {
  const content = GAME_CONTENT["script-knight"];

  it("answers the TypeScript and epic mode questions", () => {
    const questions = content.faq.map((entry) => entry.question);
    expect(questions).toContain("Can I use TypeScript?");
    expect(questions).toContain("What is epic mode?");
    const typescript = content.faq.find((entry) => entry.question === "Can I use TypeScript?");
    expect(typescript?.answer).toMatch(/JavaScript only/);
    expect(typescript?.answer).toMatch(/line numbers/);
  });

  it("tells keyboard users how to leave the editor", () => {
    const editor = content.controls.find((control) => control.input === "Editor");
    expect(editor?.action).toMatch(/Escape, then Tab/);
  });
});
