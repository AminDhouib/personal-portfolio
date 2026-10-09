"use client";

import { useLayoutEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import type { FailoverController, HudState } from "../controller";
import { T, fmt } from "../strings";
import { BUTTON, BUTTON_IDLE, BUTTON_ON, PANEL } from "./surface";

/** The gap between the ghost and the pair, in pixels. */
const GAP_PX = 12;

/**
 * Where the pair's top-left corner goes: centred under the anchor, above it
 * when there is no room below, then pushed in so all of it is on the board.
 */
function placePair(
  anchor: { x: number; y: number },
  pair: { width: number; height: number },
  board: { width: number; height: number },
): { left: number; top: number } {
  const within = (v: number, max: number) => Math.max(0, Math.min(v, max));
  let top = anchor.y + GAP_PX;
  if (top + pair.height > board.height) top = anchor.y - GAP_PX - pair.height;
  return {
    left: within(anchor.x - pair.width / 2, board.width - pair.width),
    top: within(top, board.height - pair.height),
  };
}

/**
 * A finger's placement or demolish asks first: the question and its Confirm
 * and Cancel pair sit just under the ghost (or the node), where the thumb
 * already is, and follow the camera while the choice waits. The pair is about
 * 230 to 280 px wide, so its own measured size, not a fixed margin, keeps it
 * on the board.
 */
export function ConfirmPair({
  hud,
  controller,
}: {
  hud: HudState;
  controller: FailoverController;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pending = hud.pending;

  // Measured after layout and before paint, so the pair never shows off the board.
  useLayoutEffect(() => {
    const el = ref.current;
    const board = el?.parentElement;
    if (!el || !board || !pending) return;
    const at = placePair(
      pending,
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: board.clientWidth, height: board.clientHeight },
    );
    el.style.left = `${at.left}px`;
    el.style.top = `${at.top}px`;
  });

  if (!pending) return null;
  const question = fmt(pending.kind === "place" ? T.pending_place : T.pending_demolish, {
    name: pending.name,
  });
  return (
    <div
      ref={ref}
      role="group"
      aria-label={question}
      className={`pointer-events-auto absolute flex items-center gap-1.5 p-1.5 text-xs ${PANEL}`}
    >
      <span className="px-1 whitespace-nowrap">{question}</span>
      <button
        type="button"
        aria-label={T.confirm}
        onClick={() => controller.confirm()}
        className={`${BUTTON} ${BUTTON_ON}`}
      >
        <Check className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={T.cancel}
        onClick={() => controller.cancelPending()}
        className={`${BUTTON} ${BUTTON_IDLE}`}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
