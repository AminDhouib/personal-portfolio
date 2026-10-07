import { describe, it, expect } from "vitest";
import { isTextEntryTarget } from "../keyboard";

// Dispatches a real keydown from `el` (attached to the document so it bubbles
// and composes) and reports what the helper says about that event. The helper
// reads composedPath(), which is only populated during dispatch.
function verdict(el: Element, root: Element = el): boolean {
  document.body.appendChild(root);
  let result: boolean | null = null;
  const onKey = (e: Event) => {
    result = isTextEntryTarget(e);
  };
  document.addEventListener("keydown", onKey);
  try {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, composed: true }));
  } finally {
    document.removeEventListener("keydown", onKey);
    root.remove();
  }
  return result as unknown as boolean;
}

function el(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

describe("isTextEntryTarget", () => {
  it("is true for fields where typing must not be intercepted", () => {
    expect(verdict(el('<input type="text">'))).toBe(true);
    expect(verdict(el("<textarea></textarea>"))).toBe(true);
    expect(verdict(el("<select></select>"))).toBe(true);
    expect(verdict(el('<div contenteditable="true"></div>'))).toBe(true);
  });

  it("is true for every editable contenteditable spelling", () => {
    expect(verdict(el('<div contenteditable=""></div>'))).toBe(true);
    expect(verdict(el('<div contenteditable="plaintext-only"></div>'))).toBe(true);
  });

  it("is true for an element inside an editable region", () => {
    const host = el('<div contenteditable="true"><span id="inner">x</span></div>');
    expect(verdict(host.querySelector("#inner")!, host)).toBe(true);
  });

  it("is false for a contenteditable=false island inside an editor", () => {
    const host = el(
      '<div contenteditable="true"><span id="island" contenteditable="false"><b id="deep">x</b></span></div>',
    );
    expect(verdict(host.querySelector("#island")!, host)).toBe(false);
    expect(verdict(host.querySelector("#deep")!, host)).toBe(false);
  });

  it("counts a focused checkbox: the conservative answer is documented", () => {
    expect(verdict(el('<input type="checkbox">'))).toBe(true);
  });

  it("is false for buttons and plain elements", () => {
    expect(verdict(el("<button>go</button>"))).toBe(false);
    expect(verdict(el("<div></div>"))).toBe(false);
  });

  it("sees an input inside an open shadow root", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = '<input id="in">';
    document.body.appendChild(host);
    let result: boolean | null = null;
    const onKey = (e: Event) => {
      result = isTextEntryTarget(e);
    };
    document.addEventListener("keydown", onKey);
    try {
      root
        .querySelector("#in")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, composed: true }));
    } finally {
      document.removeEventListener("keydown", onKey);
      host.remove();
    }
    expect(result).toBe(true);
  });

  it("falls back to the target when there is no composed path", () => {
    const input = document.createElement("input");
    const fake = { composedPath: () => [], target: input } as unknown as Event;
    expect(isTextEntryTarget(fake)).toBe(true);
    expect(isTextEntryTarget({ composedPath: () => [], target: null } as unknown as Event)).toBe(
      false,
    );
  });
});
