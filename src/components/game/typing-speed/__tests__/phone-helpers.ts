import { act, screen } from "@testing-library/react";
import { vi } from "vitest";

const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;

/**
 * Pretends to be a phone (below 1024 px) or a desktop; the game reads one media query.
 * The returned function flips the class and notifies listeners, as a window resize does.
 */
export function stubViewportClass(phone: boolean) {
  let isPhone = phone;
  const listeners = new Set<() => void>();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return query.includes("max-width: 1023px") ? isPhone : !isPhone;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return (next: boolean) => {
    isPhone = next;
    act(() => listeners.forEach((fn) => fn()));
  };
}

/** A visual viewport the test can resize, as the on-screen keyboard does. */
export function fakeVV(height: number, width = 390) {
  const vv = Object.assign(new EventTarget(), { height, offsetTop: 0, width, scale: 1 });
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  return vv;
}

export function resizeVV(vv: ReturnType<typeof fakeVV>, height: number) {
  act(() => {
    vv.height = height;
    vv.dispatchEvent(new Event("resize"));
  });
}

export function restoreViewport() {
  Reflect.deleteProperty(window, "visualViewport");
  Reflect.deleteProperty(window, "matchMedia");
}

export function getInput(): HTMLInputElement {
  return screen.getByLabelText("Typing area") as HTMLInputElement;
}

/** Sets the value the way a browser does (bypassing React) and fires an input event. */
export function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    valueSetter.call(input, value);
    input.dispatchEvent(new InputEvent("input", { inputType: "insertText", bubbles: true }));
  });
}
