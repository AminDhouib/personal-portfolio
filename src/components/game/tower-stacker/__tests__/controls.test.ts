import { describe, expect, it } from "vitest";
import { dropKey, isTextEntryTarget, shouldBlockScroll } from "../controls";

function keyEventOn(target: HTMLElement, key: string): KeyboardEvent {
  document.body.append(target);
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("isTextEntryTarget", () => {
  it("is true for inputs, textareas, selects and editable regions", () => {
    for (const tag of ["input", "textarea", "select"]) {
      expect(isTextEntryTarget(keyEventOn(document.createElement(tag), " "))).toBe(true);
    }
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(isTextEntryTarget(keyEventOn(editable, " "))).toBe(true);
  });

  it("is false for a plain element and for a contenteditable=false island", () => {
    expect(isTextEntryTarget(keyEventOn(document.createElement("div"), " "))).toBe(false);
    const island = document.createElement("div");
    island.setAttribute("contenteditable", "false");
    expect(isTextEntryTarget(keyEventOn(island, " "))).toBe(false);
  });
});

describe("dropKey", () => {
  it("is Space and Enter only", () => {
    const k = (key: string) => new KeyboardEvent("keydown", { key });
    expect(dropKey(k(" "))).toBe(true);
    expect(dropKey(k("Enter"))).toBe(true);
    expect(dropKey(k("a"))).toBe(false);
    expect(dropKey(k("ArrowDown"))).toBe(false);
  });
});

describe("shouldBlockScroll", () => {
  it("blocks the scrolling keys during a run, but not in a text field or between runs", () => {
    const div = document.createElement("div");
    const textarea = document.createElement("textarea");
    for (const key of [
      " ",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "PageUp",
      "PageDown",
    ]) {
      expect(shouldBlockScroll(keyEventOn(div, key), true)).toBe(true);
      expect(shouldBlockScroll(keyEventOn(div, key), false)).toBe(false);
      expect(shouldBlockScroll(keyEventOn(textarea, key), true)).toBe(false);
    }
    expect(shouldBlockScroll(keyEventOn(div, "a"), true)).toBe(false);
  });
});
