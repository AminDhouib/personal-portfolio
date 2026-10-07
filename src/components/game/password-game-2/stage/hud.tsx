"use client";

import { useEffect, useState } from "react";
import type { ActId } from "../engine/types";

interface HudProps {
  elapsedMs: number;
  act: ActId;
  seed: number;
  soundOn: boolean;
  onToggleSound: () => void;
  onCopySeed: () => void;
  /** When given, an Exit control is shown; it asks for a second tap before leaving. */
  onExit?: () => void;
}

/** The five act titles from the design spec, formatted for the HUD strip. */
const ACT_LABELS: Record<ActId, string> = {
  prologue: "Prologue — The Sign-Up",
  act1: "Act 1 — Move-In",
  act2: "Act 2 — The Infestation",
  act3: "Act 3 — The Invasion",
  finale: "Finale — The Submission",
};

/** How long an Exit stays armed (showing "Confirm exit") before it disarms. */
const EXIT_ARMED_MS = 3000;

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9v6h4l5 4V5L8 9H4z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {on ? (
        <path
          d="M16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <path
          d="M17 9.5l4 5M21 9.5l-4 5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function ExitButton({ onExit }: { onExit: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), EXIT_ARMED_MS);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => (armed ? onExit() : setArmed(true))}
      aria-label={armed ? "Confirm exit" : "Exit"}
      className={`flex min-h-11 min-w-11 items-center justify-center rounded-md border px-3 text-xs font-semibold ${
        armed
          ? "border-[color:var(--pg2-invasion)] bg-[color:var(--pg2-invasion)] text-white"
          : "border-[color:var(--pg2-line-strong)] text-[color:var(--pg2-body)] hover:bg-[color:var(--pg2-field)]"
      }`}
    >
      {armed ? "Confirm exit" : "Exit"}
    </button>
  );
}

/**
 * The always-visible run status strip inside the form panel: run timer, current
 * act, a copyable seed chip (the race-this-seed feature), the sound toggle, and Exit.
 * Every control is a 44 px target; the act name collapses to "Act N" on a phone.
 */
export function Hud({
  elapsedMs,
  act,
  seed,
  soundOn,
  onToggleSound,
  onCopySeed,
  onExit,
}: HudProps) {
  const full = ACT_LABELS[act];
  const short = full.split(" — ")[0]!;
  return (
    <div
      data-testid="pg2-hud"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[color:var(--pg2-line)] px-4 py-1.5 sm:px-5 sm:py-2"
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <span
          className="font-mono text-lg font-semibold text-[color:var(--pg2-ink)] tabular-nums"
          aria-label="Run time"
        >
          {formatTime(elapsedMs)}
        </span>
        <span className="text-xs font-semibold tracking-wide text-[color:var(--pg2-muted)] uppercase">
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{full}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCopySeed}
          aria-label={`Copy race link for seed ${seed}`}
          className="pg2-seedchip min-h-11 rounded-md border border-[color:var(--pg2-line-strong)] px-2.5 text-xs text-[color:var(--pg2-body)]"
        >
          seed {seed}
        </button>
        <button
          type="button"
          onClick={onToggleSound}
          aria-label={soundOn ? "Mute sound" : "Enable sound"}
          aria-pressed={soundOn}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[color:var(--pg2-line-strong)] text-[color:var(--pg2-body)] hover:bg-[color:var(--pg2-field)]"
        >
          <SpeakerIcon on={soundOn} />
        </button>
        {onExit ? <ExitButton onExit={onExit} /> : null}
      </div>
    </div>
  );
}
