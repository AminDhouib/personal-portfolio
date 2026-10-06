import { z } from "zod";
import { safeJsonParse } from "@/lib/safe-json";

const STORAGE_KEY = "svf:progress";

// The engine's displayed level runs 1..9 (internal level caps at 8, the
// getter adds one). The scoreboard renders five digits.
export const MAX_LEVEL = 9;
export const MAX_TOTAL_SCORE = 99999;

export type SavedProgress = { currentLevel: number; totalScore: number };

const progressSchema = z.object({
  currentLevel: z
    .number()
    .int()
    .transform((n) => Math.max(1, Math.min(MAX_LEVEL, n))),
  totalScore: z
    .number()
    .int()
    .min(0)
    .transform((n) => Math.min(MAX_TOTAL_SCORE, n)),
});

export function parseProgress(raw: unknown): SavedProgress | null {
  const result = progressSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function loadProgress(): SavedProgress | null {
  let text: string | null;
  try {
    text = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means no saved progress
    return null;
  }
  if (text === null) return null;
  return parseProgress(safeJsonParse<unknown>(text, "voltorb:progress"));
}
