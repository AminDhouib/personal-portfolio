/**
 * Runs `cb` on the first task after the page's `load` event (or the next task
 * if the page has already loaded). Used to keep the game's background-music
 * fetch off the critical rendering path. Returns a cancel function; cancelling
 * after the callback ran does nothing.
 */
export function afterPageLoad(cb: () => void): () => void {
  let timer: number | null = null;
  const schedule = () => {
    timer = window.setTimeout(cb, 0);
  };
  if (document.readyState === "complete") {
    schedule();
  } else {
    window.addEventListener("load", schedule, { once: true });
  }
  return () => {
    window.removeEventListener("load", schedule);
    if (timer !== null) window.clearTimeout(timer);
  };
}
