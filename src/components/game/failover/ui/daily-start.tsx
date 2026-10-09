"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { utcDayKey } from "@/lib/arcade/boards";
import type { FailoverController, HudState } from "../controller";
import { T } from "../strings";
import { BUTTON, BUTTON_IDLE, BUTTON_ON } from "./surface";

/**
 * Starts today's Daily Incident. A run that is under way is asked about first, because the
 * daily replaces it; a fresh or finished board starts at once.
 */
export function DailyStart({
  hud,
  controller,
  onStarted,
}: {
  hud: HudState;
  controller: FailoverController;
  onStarted: () => void;
}) {
  const [asking, setAsking] = useState(false);

  const start = () => {
    setAsking(false);
    controller.startDaily(utcDayKey(new Date()));
    onStarted();
  };

  if (asking) {
    return (
      <div
        role="group"
        aria-label={T.daily_start}
        className="pointer-events-auto flex flex-wrap items-center gap-1.5 text-xs text-[#d4d4d8]"
      >
        <span>{T.daily_replace}</span>
        <button type="button" onClick={start} className={`${BUTTON} ${BUTTON_ON}`}>
          {T.daily_replace_yes}
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className={`${BUTTON} ${BUTTON_IDLE}`}
        >
          {T.cancel}
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto">
      <button
        type="button"
        aria-label={T.daily_start_tip}
        title={T.daily_start_tip}
        aria-pressed={hud.daily !== null && !hud.over}
        onClick={() => (hud.time > 0 && !hud.over ? setAsking(true) : start())}
        className={`${BUTTON} ${hud.daily !== null && !hud.over ? BUTTON_ON : BUTTON_IDLE}`}
      >
        <CalendarDays className="h-4 w-4" aria-hidden />
        {T.daily_start}
      </button>
    </div>
  );
}
