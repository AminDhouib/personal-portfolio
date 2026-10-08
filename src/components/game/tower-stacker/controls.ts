/**
 * True when a key event comes from somewhere the user is typing: an input, textarea or
 * select, or an editable region. The stage ignores those keys so the AI chat keeps every
 * key it is given. A copy of Super Voltorb Flip's helper (games do not import each
 * other's modules).
 *
 * The origin is `composedPath()[0]` (the real element even inside an open shadow root),
 * falling back to `event.target`.
 */
export function isTextEntryTarget(event: Event): boolean {
  const origin = event.composedPath()[0] ?? event.target;
  if (!(origin instanceof HTMLElement)) return false;
  if (origin.isContentEditable || origin.closest("input, textarea, select") !== null) return true;
  // jsdom has no isContentEditable: the nearest contenteditable attribute decides.
  const nearest = origin.closest("[contenteditable]");
  return nearest !== null && nearest.getAttribute("contenteditable")?.toLowerCase() !== "false";
}

/** Space and Enter release the hanging block. */
export function dropKey(event: KeyboardEvent): boolean {
  return event.key === " " || event.key === "Enter";
}

const SCROLL_KEYS = new Set([
  " ",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
]);

/** While a run is live these keys must not scroll the page, unless typed into a field. */
export function shouldBlockScroll(event: KeyboardEvent, live: boolean): boolean {
  return live && SCROLL_KEYS.has(event.key) && !isTextEntryTarget(event);
}
