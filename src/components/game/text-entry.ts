/**
 * True when a key event comes from somewhere the user is typing: an input,
 * textarea or select, or an editable region. Game-level key handlers return
 * early for these so the AI chat (or any field) keeps every key it is given.
 * Every INPUT counts, checkboxes included: the conservative answer costs the
 * game nothing.
 *
 * The origin is `composedPath()[0]` (the real element even inside an open
 * shadow root, where `event.target` is retargeted to the host), falling back
 * to `event.target`.
 */
export function isTextEntryTarget(event: Event): boolean {
  const origin = event.composedPath()[0] ?? event.target;
  if (!(origin instanceof HTMLElement)) return false;
  if (origin.isContentEditable || origin.closest("input, textarea, select") !== null) return true;
  // jsdom has no isContentEditable: read the nearest contenteditable attribute
  // instead. The nearest one decides, so a contenteditable="false" island
  // inside an editor is not an editor.
  const nearest = origin.closest("[contenteditable]");
  return nearest !== null && nearest.getAttribute("contenteditable")?.toLowerCase() !== "false";
}
