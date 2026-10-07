import { z } from "zod";
import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";
import { storedVersionIsNewer } from "./stored-version";

// Player settings. Their own key: svf:progress and svf:muted keep their shapes.
export const SETTINGS_KEY = "svf:settings";

export type Settings = {
  /** Memo undo button and Ctrl/Cmd+Z. */
  memoUndo: boolean;
  /** Record local statistics and show the Statistics entry. */
  stats: boolean;
  /** Show each face-down tile's Voltorb odds (T2e-2). Off by default. */
  assist: boolean;
};

export const DEFAULT_SETTINGS: Settings = { memoUndo: true, stats: true, assist: false };

// A version other than 1 is a shape this code does not know: use the defaults
// rather than guess. Each field is read on its own, so one bad value does not
// reset the other two.
const settingsSchema = z.object({
  v: z.literal(1),
  memoUndo: z.boolean().catch(DEFAULT_SETTINGS.memoUndo),
  stats: z.boolean().catch(DEFAULT_SETTINGS.stats),
  assist: z.boolean().catch(DEFAULT_SETTINGS.assist),
});

export function parseSettings(raw: unknown): Settings {
  const result = settingsSchema.safeParse(raw);
  if (!result.success) return { ...DEFAULT_SETTINGS };
  const { memoUndo, stats, assist } = result.data;
  return { memoUndo, stats, assist };
}

export function loadSettings(): Settings {
  let text: string | null;
  try {
    text = window.localStorage.getItem(SETTINGS_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means the defaults
    return { ...DEFAULT_SETTINGS };
  }
  if (text === null) return { ...DEFAULT_SETTINGS };
  return parseSettings(safeJsonParse<unknown>(text, "voltorb:settings"));
}

export function saveSettings(settings: Settings): void {
  // A newer build wrote this: leave it alone rather than downgrade it.
  if (storedVersionIsNewer(SETTINGS_KEY)) return;
  safeLocalSet(
    SETTINGS_KEY,
    JSON.stringify({
      v: 1,
      memoUndo: settings.memoUndo,
      stats: settings.stats,
      assist: settings.assist,
    }),
  );
}
