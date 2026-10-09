"use client";

import { Check, X } from "lucide-react";
import type { FailoverController, HudState } from "../controller";
import { T, fmt } from "../strings";
import { BUTTON, BUTTON_IDLE, BUTTON_ON, PANEL } from "./surface";

/**
 * A finger's placement or demolish asks first: the question and its Confirm
 * and Cancel pair sit just under the ghost (or the node), where the thumb
 * already is, and follow the camera while the choice waits.
 */
export function ConfirmPair({
  hud,
  controller,
}: {
  hud: HudState;
  controller: FailoverController;
}) {
  const pending = hud.pending;
  if (!pending) return null;
  const question = fmt(pending.kind === "place" ? T.pending_place : T.pending_demolish, {
    name: pending.name,
  });
  return (
    <div
      role="group"
      aria-label={question}
      className={`pointer-events-auto absolute flex -translate-x-1/2 translate-y-3 items-center gap-1.5 p-1.5 text-xs ${PANEL}`}
      style={{ left: pending.x, top: pending.y }}
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
