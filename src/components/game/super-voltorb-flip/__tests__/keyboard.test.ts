import { describe, it, expect } from "vitest";
import { isTextEntryTarget } from "../keyboard";

function el(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

describe("isTextEntryTarget", () => {
  it("is true for fields where typing must not be intercepted", () => {
    expect(isTextEntryTarget(el('<input type="text">'))).toBe(true);
    expect(isTextEntryTarget(el("<textarea></textarea>"))).toBe(true);
    expect(isTextEntryTarget(el("<select></select>"))).toBe(true);
    expect(isTextEntryTarget(el('<div contenteditable="true"></div>'))).toBe(true);
  });

  it("is true for an element inside an editable region", () => {
    const host = el('<div contenteditable="true"><span id="inner">x</span></div>');
    expect(isTextEntryTarget(host.querySelector("#inner"))).toBe(true);
  });

  it("is false for buttons, plain elements, the document and null", () => {
    expect(isTextEntryTarget(el("<button>go</button>"))).toBe(false);
    expect(isTextEntryTarget(el("<div></div>"))).toBe(false);
    expect(isTextEntryTarget(document)).toBe(false);
    expect(isTextEntryTarget(window)).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});
