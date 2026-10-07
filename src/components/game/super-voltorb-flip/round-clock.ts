// The round clock behind the Lv.8 time statistic. It counts visible time only
// and starts at the round's first action, so a background tab or a board left
// idle before the first flip adds nothing. Pure: the caller owns the state.
export type RoundClock = {
  /** Visible milliseconds banked so far. */
  elapsedMs: number;
  /** When the running stretch began, or null while paused or not started. */
  since: number | null;
  started: boolean;
  ended: boolean;
};

export const newRoundClock = (): RoundClock => ({
  elapsedMs: 0,
  since: null,
  started: false,
  ended: false,
});

/** The first action of the round. A no-op once started or ended, or while the tab is hidden. */
export function startClock(c: RoundClock, now: number, hidden: boolean): RoundClock {
  if (c.started || c.ended || hidden) return c;
  return { ...c, started: true, since: now };
}

/** The tab was hidden: bank the running stretch. */
export function pauseClock(c: RoundClock, now: number): RoundClock {
  if (c.since === null) return c;
  return { ...c, elapsedMs: c.elapsedMs + Math.max(0, now - c.since), since: null };
}

/** The tab is visible again: resume only a round that started and has not ended. */
export function resumeClock(c: RoundClock, now: number): RoundClock {
  if (!c.started || c.ended || c.since !== null) return c;
  return { ...c, since: now };
}

/** Whole seconds counted so far. */
export function clockSeconds(c: RoundClock, now: number): number {
  const running = c.since === null ? 0 : Math.max(0, now - c.since);
  return Math.round((c.elapsedMs + running) / 1000);
}

/** The round is over: freeze the count. */
export function endClock(c: RoundClock, now: number): RoundClock {
  return { ...pauseClock(c, now), ended: true };
}
