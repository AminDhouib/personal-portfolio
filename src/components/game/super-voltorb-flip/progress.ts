import { z } from "zod";
import { safeJsonParse } from "@/lib/safe-json";
import { HISTORY_SIZE, MAX_LEVEL as HGSS_MAX_LEVEL, type RoundSummary } from "./hgss";

const STORAGE_KEY = "svf:progress";

// Levels run 1..8 as in HGSS. The scoreboard renders five digits.
export const MAX_LEVEL = HGSS_MAX_LEVEL;
export const MAX_TOTAL_SCORE = 99999;

export type SavedProgress = { currentLevel: number; totalScore: number; history?: RoundSummary[] };

const roundSchema = z.object({
  outcome: z.enum(["none", "quit", "won", "lost"]),
  cardsFlipped: z.number().int().min(0).max(25),
  boardId: z.number().int().min(0).max(79),
});

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
  // An unreadable history is dropped, not fatal: the level and coins still load.
  history: z.array(roundSchema).length(HISTORY_SIZE).optional().catch(undefined),
});

export function parseProgress(raw: unknown): SavedProgress | null {
  const result = progressSchema.safeParse(raw);
  if (!result.success) return null;
  const { history, ...rest } = result.data;
  return history ? { ...rest, history } : rest;
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
