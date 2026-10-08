/** Layout distance from the top of the document-ish root, ignoring every transform. */
function layoutTop(el: HTMLElement): number {
  let top = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
    top += n.offsetTop;
  }
  return top;
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const overflowY = getComputedStyle(n).overflowY;
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") return n;
  }
  return null;
}

function inFlight(el: HTMLElement): boolean {
  const host = el.closest<HTMLElement>("[data-flip-id]") ?? el;
  const running = (e: HTMLElement, subtree: boolean) =>
    typeof e.getAnimations === "function" && e.getAnimations({ subtree }).length > 0;
  return running(host, true) || running(el, true);
}

/**
 * Smoothly scroll the active rule into view. While a FLIP or entrance animation is moving the
 * card, its painted rect is off by the transform, so the target comes from layout offsets
 * (which ignore transforms) against the nearest scrolling ancestor instead.
 */
export function followRule(rule: HTMLElement): void {
  if (!inFlight(rule)) {
    if (typeof rule.scrollIntoView === "function") {
      rule.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    return;
  }
  const scroller = scrollParent(rule);
  if (!scroller || typeof scroller.scrollTo !== "function") return;
  const top = layoutTop(rule) - layoutTop(scroller) - scroller.clientTop;
  const bottom = top + rule.offsetHeight;
  if (top < scroller.scrollTop) {
    scroller.scrollTo({ top, behavior: "smooth" });
  } else if (bottom > scroller.scrollTop + scroller.clientHeight) {
    scroller.scrollTo({ top: bottom - scroller.clientHeight, behavior: "smooth" });
  }
}
