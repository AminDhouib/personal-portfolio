import { z } from "zod";
import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";
import { isDayKey } from "./daily-board";
import { storedVersionIsNewer } from "./stored-version";

// The player's one attempt at one UTC day's Daily board. Own key. Local,
// forgeable and trusted only as far as the server's plausibility ceiling
// (DESIGN.md): clearing it starts a new attempt, which the leaderboard cannot
// tell apart from a second device. The flips are the attempt (a refresh replays
// them); the score and the level are derived, never stored.
export const DAILY_KEY = "svf:daily";

export const HANDLE_MAX = 12;

export type DailyOutcome = "won" | "lost" | "quit";

export type DailyRound = {
  /** The name posted with the score; "" until the player picks one. */
  handle: string;
  /** "YYYY-MM-DD", UTC. */
  day: string;
  /** Tile indices (row * 5 + col) in the order they were flipped. */
  flips: number[];
  /** Null while the board is still being played. */
  outcome: DailyOutcome | null;
  /** The score reached the leaderboard. */
  submitted: boolean;
};

const dailySchema = z.object({
  v: z.literal(1),
  handle: z
    .string()
    .transform((s) => s.trim().slice(0, HANDLE_MAX))
    .catch(""),
  day: z.string().refine(isDayKey),
  flips: z
    .array(z.number().int().min(0).max(24))
    .max(25)
    .refine((list) => new Set(list).size === list.length),
  outcome: z.enum(["won", "lost", "quit"]).nullable(),
  submitted: z.boolean(),
});

export function parseDaily(raw: unknown): DailyRound | null {
  const result = dailySchema.safeParse(raw);
  if (!result.success) return null;
  const { handle, day, flips, outcome, submitted } = result.data;
  return { handle, day, flips, outcome, submitted };
}

export function loadDaily(): DailyRound | null {
  let text: string | null;
  try {
    text = window.localStorage.getItem(DAILY_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means no saved attempt
    return null;
  }
  if (text === null) return null;
  return parseDaily(safeJsonParse<unknown>(text, "voltorb:daily"));
}

export function saveDaily(round: DailyRound): void {
  // A newer build wrote this: leave it alone rather than downgrade it.
  if (storedVersionIsNewer(DAILY_KEY)) return;
  safeLocalSet(
    DAILY_KEY,
    JSON.stringify({
      v: 1,
      handle: round.handle,
      day: round.day,
      flips: round.flips,
      outcome: round.outcome,
      submitted: round.submitted,
    }),
  );
}

export function freshDaily(day: string, handle: string): DailyRound {
  return { handle, day, flips: [], outcome: null, submitted: false };
}
