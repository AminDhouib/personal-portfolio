import { z } from "zod";
import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";
import type { TowerId } from "./engine/towers";
import { storedVersionIsNewer } from "./stored-version";

// The player's code. One evolving Player per tower, as upstream keeps one Player.js per profile.
// Display-only and local, like every knight:* key.
export const CODE_KEY = "knight:code";

export const CODE_MAX_CHARS = 20_000;
export const TOO_LONG_MESSAGE = "That is longer than 20,000 characters; it was not saved.";

export type CodeStore = {
  v: 1;
  towers: Record<TowerId, string>;
  /** The daily floor's code (T7-5 fills it in). */
  daily: { day: string; code: string } | null;
};

export function emptyCodeStore(): CodeStore {
  return { v: 1, towers: { "narrow-path": "", "powder-keep": "" }, daily: null };
}

const codeText = z.string().max(CODE_MAX_CHARS).catch("");

const codeSchema = z.object({
  v: z.literal(1),
  towers: z
    .object({ "narrow-path": codeText, "powder-keep": codeText })
    .catch({ "narrow-path": "", "powder-keep": "" }),
  daily: z
    .object({
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      code: z.string().max(CODE_MAX_CHARS),
    })
    .nullable()
    .catch(null),
});

export function parseCode(raw: unknown): CodeStore {
  const result = codeSchema.safeParse(raw);
  return result.success ? result.data : emptyCodeStore();
}

export function loadCode(): CodeStore {
  let text: string | null;
  try {
    text = window.localStorage.getItem(CODE_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means no saved code
    return emptyCodeStore();
  }
  if (text === null) return emptyCodeStore();
  return parseCode(safeJsonParse<unknown>(text, "knight:code"));
}

export function saveCode(store: CodeStore): void {
  // A newer build wrote this: leave it alone rather than downgrade it.
  if (storedVersionIsNewer(CODE_KEY)) return;
  safeLocalSet(CODE_KEY, JSON.stringify(store));
}

/** Puts a tower's code in the store, or refuses code over the cap and says why. */
export function setTowerCode(
  store: CodeStore,
  tower: TowerId,
  code: string,
): { ok: true; store: CodeStore } | { ok: false; reason: "too-long" } {
  if (code.length > CODE_MAX_CHARS) return { ok: false, reason: "too-long" };
  return { ok: true, store: { ...store, towers: { ...store.towers, [tower]: code } } };
}
