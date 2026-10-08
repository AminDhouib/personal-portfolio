import { z } from "zod";
import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";

// One-time tips the shell shows once per browser. Its own key, never read by the games hub
// (HUB_STAT_KEYS stays an allowlist of score keys).
export const TIPS_KEY = "hextris_tips";

export type Tips = {
  /** The Panic Clear tip has been shown (or Panic Clear used) once already. */
  panicSeen: boolean;
};

const DEFAULT_TIPS: Tips = { panicSeen: false };

// A version other than 1 is a shape this code does not know: read it as nothing seen, which at
// worst shows a tip one more time.
const tipsSchema = z.object({
  v: z.literal(1),
  panicSeen: z.boolean(),
});

export function readTips(): Tips {
  let text: string | null;
  try {
    text = window.localStorage.getItem(TIPS_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means no tip has been seen
    return { ...DEFAULT_TIPS };
  }
  if (text === null) return { ...DEFAULT_TIPS };
  const result = tipsSchema.safeParse(safeJsonParse<unknown>(text, "hextris:tips"));
  if (!result.success) return { ...DEFAULT_TIPS };
  return { panicSeen: result.data.panicSeen };
}

export function markPanicTipSeen(): void {
  safeLocalSet(TIPS_KEY, JSON.stringify({ v: 1, panicSeen: true }));
}
