"use client";

import { X } from "lucide-react";
import type { FailoverController, HudState } from "../controller";
import { saveGfxPref, type GfxPref } from "../prefs";
import { T } from "../strings";
import { BUTTON, BUTTON_IDLE, BUTTON_ON, PANEL, TOUCH } from "./surface";

const GFX: readonly { pref: GfxPref; label: string }[] = [
  { pref: "auto", label: T.gfx_auto },
  { pref: "high", label: T.gfx_high },
  { pref: "low", label: T.gfx_low },
];

/**
 * Sound (cues only; there is no music), the graphics tier (Auto picks from the
 * device and the frame times, High or Low pin it; kept in failover:gfx), the
 * coach replay, and a note on reduced motion: games keep their motion when the
 * OS asks for less (DESIGN.md's register), so this game does not gate on it.
 */
export function Settings({
  hud,
  controller,
  onReplayCoach,
  onClose,
}: {
  hud: HudState;
  controller: FailoverController;
  onReplayCoach: () => void;
  onClose: () => void;
}) {
  const choose = (pref: GfxPref) => {
    saveGfxPref(pref);
    controller.setGfxPref(pref);
  };
  return (
    <section
      aria-label={T.settings}
      className={`pointer-events-auto flex w-72 max-w-full flex-col gap-3 p-3 text-xs ${PANEL}`}
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#ededed]">{T.settings}</h3>
        <button
          type="button"
          aria-label={T.close}
          onClick={onClose}
          className={`${BUTTON} ${BUTTON_IDLE}`}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="flex items-center justify-between gap-2">
        <span>{T.sound}</span>
        <button
          type="button"
          aria-pressed={hud.soundOn}
          onClick={() => controller.setSoundOn(!hud.soundOn)}
          className={`${BUTTON} ${hud.soundOn ? BUTTON_ON : BUTTON_IDLE}`}
        >
          {hud.soundOn ? T.sound_off : T.sound_on}
        </button>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1">{T.graphics}</legend>
        <div className="flex gap-1">
          {GFX.map(({ pref, label }) => (
            <label
              key={pref}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border px-2 py-1.5 ${TOUCH} ${
                hud.gfxPref === pref ? BUTTON_ON : BUTTON_IDLE
              }`}
            >
              <input
                type="radio"
                name="failover-gfx"
                value={pref}
                checked={hud.gfxPref === pref}
                onChange={() => choose(pref)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
        <p className="text-[#a1a1aa]">{hud.tier === "high" ? T.gfx_now_high : T.gfx_now_low}</p>
      </fieldset>

      <button
        type="button"
        onClick={onReplayCoach}
        className={`${BUTTON} ${BUTTON_IDLE} self-start`}
      >
        {T.replay_coach}
      </button>

      <p className="text-[#a1a1aa]">{T.reduced_motion_note}</p>
    </section>
  );
}
