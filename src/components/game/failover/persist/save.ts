import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";
import { CONFIG } from "../sim/config";
import { encodeProof, parseProof } from "../sim/proof";
import { replayAsync, ReplayError, type ReplayErrorCode, type ReplayResult } from "../sim/replay";
import { S } from "../sim/state";
import { MAX_SAVE_TICKS, parseSave, SAVE_KEY, type SaveV1 } from "./save-schema";

// One save slot. Writing is the live run's seed and action log; loading is a
// replay through the same dispatch and step the live game used, so a save
// cannot hold a board the rules would have refused.

export type CaptureFailure = "over" | "too-many-actions" | "too-long" | "unencodable";

export type CaptureResult = { ok: true; save: SaveV1 } | { ok: false; reason: CaptureFailure };

/** The save of the run in the live sim, or why it cannot be saved. `now` is epoch milliseconds. */
export function captureSave(now: number): CaptureResult {
  // A finished run takes no more actions, so there is nothing to resume.
  if (S.over) return { ok: false, reason: "over" };
  // A log past the cap is incomplete, so replaying it would not reproduce the run.
  if (S.logOverflow) return { ok: false, reason: "too-many-actions" };
  if (S.tick > MAX_SAVE_TICKS) return { ok: false, reason: "too-long" };

  let log: string;
  try {
    log = encodeProof(S.log);
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    // A refused off-board placement is in the log, and the proof format cannot write it down.
    return { ok: false, reason: "unencodable" };
  }

  const save: SaveV1 = {
    v: 1,
    savedAt: Math.floor(now),
    mode: S.gameMode,
    seed: S.seed,
    tick: S.tick,
    log,
  };
  const budget = Math.round(S.sandboxBudget);
  if (S.gameMode === "sandbox" && budget !== CONFIG.sandbox.defaultBudget) save.budget = budget;

  // Never write what we would not read back.
  const checked = parseSave(save);
  return checked ? { ok: true, save: checked } : { ok: false, reason: "unencodable" };
}

/** True when the slot holds a value a newer build wrote; saving over it would downgrade it. */
function slotIsNewer(): boolean {
  let text: string | null;
  try {
    text = window.localStorage.getItem(SAVE_KEY);
  } catch {
    // silent-ok: blocked storage cannot hold a newer value, and the write will fail on its own
    return false;
  }
  if (text === null) return false;
  const value = safeJsonParse(text, "failover:save");
  if (typeof value !== "object" || value === null) return false;
  const v = (value as { v?: unknown }).v;
  return typeof v === "number" && v > 1;
}

export type WriteResult = "written" | "newer" | "failed";

/** Put a save in the slot. A value from a newer build is left alone. */
export function writeSave(save: SaveV1): WriteResult {
  if (slotIsNewer()) return "newer";
  return safeLocalSet(SAVE_KEY, JSON.stringify(save)) ? "written" : "failed";
}

/** The saved game, or null if the slot is empty, blocked, corrupt or not a v1 save. */
export function readSave(): SaveV1 | null {
  let text: string | null;
  try {
    text = window.localStorage.getItem(SAVE_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means no save
    return null;
  }
  if (text === null) return null;
  return parseSave(safeJsonParse<unknown>(text, "failover:save"));
}

export type LoadResult =
  { ok: true; result: ReplayResult } | { ok: false; reason: ReplayErrorCode | "invalid" };

/** Ticks played between yields while a save loads. */
const LOAD_CHUNK_TICKS = 500;

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Replay a save into the live sim, leaving it at the saved tick, ready to carry on. A save the
 * replay refuses (a log the proof path would also refuse) comes back as a reason and touches
 * nothing. The caller must not step the sim until this resolves.
 */
export async function loadSave(
  save: SaveV1,
  yieldFn: () => Promise<void> = yieldToEventLoop,
): Promise<LoadResult> {
  const checked = parseSave(save);
  const log = checked ? parseProof(checked.log) : null;
  if (!checked || !log) return { ok: false, reason: "invalid" };
  try {
    const result = await replayAsync(
      {
        seed: checked.seed,
        mode: checked.mode,
        ...(checked.budget === undefined ? {} : { budget: checked.budget }),
        log,
        ticks: checked.tick,
      },
      { yieldEvery: LOAD_CHUNK_TICKS, yieldFn },
    );
    return { ok: true, result };
  } catch (err) {
    if (err instanceof ReplayError) return { ok: false, reason: err.code };
    throw err;
  }
}
