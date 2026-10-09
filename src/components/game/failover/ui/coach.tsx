"use client";

import { useEffect } from "react";
import type { HudState } from "../controller";
import { T, fmt } from "../strings";
import { BUTTON, BUTTON_IDLE, PANEL } from "./surface";

interface Step {
  title: string;
  text: string;
  hint: string;
  done: (hud: HudState) => boolean;
}

/** Five steps, each ticked off by the board itself, not by a Next button. */
export const COACH_STEPS: readonly Step[] = [
  {
    title: T.tut_place_fw_title,
    text: T.tut_place_fw_text,
    hint: T.tut_place_fw_hint,
    done: (hud) => hud.milestones.waf,
  },
  {
    title: T.tut_connect_fw_title,
    text: T.tut_connect_fw_text,
    hint: T.tut_connect_fw_hint,
    done: (hud) => hud.milestones.wafLinked,
  },
  {
    title: T.tut_place_compute_title,
    text: T.tut_place_compute_text,
    hint: T.tut_place_compute_hint,
    done: (hud) => hud.milestones.compute,
  },
  {
    title: T.tut_place_db_title,
    text: T.tut_place_db_text,
    hint: T.tut_place_db_hint,
    done: (hud) => hud.milestones.db,
  },
  {
    title: T.tut_ready_title,
    text: T.tut_ready_text,
    hint: T.tut_ready_hint,
    done: (hud) => !hud.paused,
  },
];

/** The first step the board has not done yet, or the step count when all are done. */
export function coachStep(hud: HudState): number {
  const next = COACH_STEPS.findIndex((step) => !step.done(hud));
  return next < 0 ? COACH_STEPS.length : next;
}

/**
 * The first-run coach: place a firewall, link the Internet to it, add a
 * compute node and a database, then press Play. Each step is read off the sim
 * (the HUD's milestones and the clock), so it moves on by itself; the run
 * starts paused under it and the last step is starting the clock. Skip ends it
 * early. Either way onDone runs once (skipped or not), and the caller keeps it
 * in failover:coach.
 */
export function Coach({ hud, onDone }: { hud: HudState; onDone: (skipped: boolean) => void }) {
  const index = coachStep(hud);
  const finished = index >= COACH_STEPS.length;
  useEffect(() => {
    if (finished) onDone(false);
  }, [finished, onDone]);
  if (finished) return null;
  const step = COACH_STEPS[index]!;
  return (
    <section
      aria-label={T.tut_welcome_title}
      className={`pointer-events-auto flex w-80 max-w-full flex-col gap-1.5 p-3 text-xs ${PANEL}`}
    >
      <p className="font-mono text-[10px] tracking-wider text-[#06b6d4] uppercase">
        {fmt(T.coach_step, { n: index + 1, total: COACH_STEPS.length })}
      </p>
      <div aria-live="polite">
        <h3 className="text-sm font-semibold text-[#ededed]">{step.title}</h3>
        <p>{step.text}</p>
        <p className="mt-1 text-[#a1a1aa]">{step.hint}</p>
      </div>
      <button
        type="button"
        onClick={() => onDone(true)}
        className={`${BUTTON} ${BUTTON_IDLE} self-end`}
      >
        {T.skip_tutorial}
      </button>
    </section>
  );
}
