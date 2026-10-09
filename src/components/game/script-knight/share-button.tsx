"use client";

import { useState } from "react";
import { decodeLog } from "./engine/codec";
import type { LevelRef } from "./engine/level-ref";
import { buildReplayFragment } from "./replay-link";
import { replayUrl, shareResult, type ShareOutcome, shareText } from "./share";
import { TOUCH } from "./surface";

const BUTTON = `rounded-md border border-(--border) px-3 py-1.5 text-sm text-(--foreground) hover:border-accent-green ${TOUCH}`;

const SAID: Record<ShareOutcome, string> = {
  shared: "Shared.",
  copied: "Copied to the clipboard.",
  dismissed: "",
  failed: "Could not copy.",
};

export interface ShareRunButtonProps {
  floor: LevelRef;
  /** The run's action log, "1:...". */
  log: string;
  /** What the run was on: the UTC day of a daily or a tower floor's name. */
  title: string;
  score: number;
  turns: number;
  par: number | null;
}

/**
 * Shares a finished run as text plus a replay link. The longest run the codec holds (200 turns)
 * still fits under the link cap, so a link is always whole; a log that cannot be read offers none.
 */
export function ShareRunButton({ floor, log, title, score, turns, par }: ShareRunButtonProps) {
  const [said, setSaid] = useState("");
  const actions = decodeLog(log);
  if (actions === null) return null;
  const link = replayUrl(buildReplayFragment(floor, actions));
  async function share() {
    setSaid(SAID[await shareResult(shareText({ title, score, turns, par, link }))]);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void share()} className={BUTTON}>
        Share this run
      </button>
      <span role="status" className="text-xs text-(--muted)">
        {said}
      </span>
    </div>
  );
}
