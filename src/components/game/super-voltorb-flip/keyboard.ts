/**
 * True when a key event's target is somewhere the user is typing: an input,
 * textarea or select, or inside a contenteditable region. Game-level key
 * handlers return early for these so the AI chat (or any field) keeps every
 * key it is given. Every INPUT counts, checkboxes included: the conservative
 * answer costs the game nothing.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}
