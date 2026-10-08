/** Layout distance from the top of the document-ish root, ignoring every transform. */
function layoutTop(el: HTMLElement): number {
  let top = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
    top += n.offsetTop;
  }
  return top;
}

function isScroller(n: HTMLElement): boolean {
  const overflowY = getComputedStyle(n).overflowY;
  return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
}

function inFlight(el: HTMLElement): boolean {
  const host = el.closest<HTMLElement>("[data-flip-id]") ?? el;
  const running = (e: HTMLElement, subtree: boolean) =>
    typeof e.getAnimations === "function" && e.getAnimations({ subtree }).length > 0;
  return running(host, true) || running(el, true);
}

/**
 * Instantly scroll the active rule into view (instant scrolls cannot fight one another or
 * the caret reveal). While a FLIP or entrance animation is moving the
 * card, its painted rect is off by the transform, so the target comes from layout offsets
 * (which ignore transforms) against every scrolling ancestor instead.
 */
export function followRule(rule: HTMLElement): void {
  if (!inFlight(rule)) {
    if (typeof rule.scrollIntoView === "function") {
      rule.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
    return;
  }
  // Like scrollIntoView({ block: "nearest" }) on every scrolling ancestor, innermost first,
  // but from layout offsets. `consumed` is how far the inner scrollers will have moved the
  // card by then, so each outer scroller sees where the card will actually be.
  let consumed = 0;
  for (let n = rule.parentElement; n; n = n.parentElement) {
    if (!isScroller(n) || typeof n.scrollTo !== "function") continue;
    const top = layoutTop(rule) - layoutTop(n) - n.clientTop - consumed;
    const bottom = top + rule.offsetHeight;
    let target = n.scrollTop;
    if (top < n.scrollTop) target = top;
    else if (bottom > n.scrollTop + n.clientHeight) target = bottom - n.clientHeight;
    if (target !== n.scrollTop) n.scrollTo({ top: target, behavior: "auto" });
    consumed += target;
  }
}
