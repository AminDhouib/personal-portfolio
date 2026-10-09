import { z } from "zod";
import { parseProof } from "../sim/proof";

// failover:save:v1 is the seed plus the action log, not the state, so a save is
// tiny, forward-safe and proves the replay path on the client: loading replays
// the run to `tick`. The log is the same proof string the leaderboard takes, so
// it obeys the same 700-action cap and the same strict number syntax.
export const SAVE_KEY = "failover:save:v1";

/** A save replays on load, so a longer run than this (30 minutes of game time) is not saved. */
export const MAX_SAVE_TICKS = 36_000;
/** The arcade route's proof cap; a save's log is never longer than a proof can be. */
export const MAX_SAVE_LOG_CHARS = 12_000;
export const MAX_SEED_CHARS = 64;
/** Matches the blueprint format's budget clamp. */
export const MAX_SAVE_BUDGET = 1_000_000;

export interface SaveV1 {
  v: 1;
  /** Epoch milliseconds the save was written. Display only. */
  savedAt: number;
  mode: "survival" | "sandbox";
  seed: string;
  /** The tick the run was at; loading replays to here. */
  tick: number;
  /** The action log as a proof string (sim/proof.ts). */
  log: string;
  /** Starting money of a sandbox run whose budget is not the default. Absent for survival. */
  budget?: number;
}

const nonNegativeInt = z.number().int().nonnegative();

const saveSchema = z
  .strictObject({
    v: z.literal(1),
    savedAt: nonNegativeInt.max(Number.MAX_SAFE_INTEGER),
    mode: z.enum(["survival", "sandbox"]),
    seed: z.string().min(1).max(MAX_SEED_CHARS),
    tick: nonNegativeInt.max(MAX_SAVE_TICKS),
    log: z.string().max(MAX_SAVE_LOG_CHARS),
    budget: nonNegativeInt.max(MAX_SAVE_BUDGET).optional(),
  })
  .superRefine((save, ctx) => {
    if (save.budget !== undefined && save.mode !== "sandbox") {
      ctx.addIssue({ code: "custom", path: ["budget"], message: "budget is sandbox only" });
    }
    const log = parseProof(save.log);
    if (log === null) {
      ctx.addIssue({ code: "custom", path: ["log"], message: "not a valid proof" });
      return;
    }
    const last = log[log.length - 1];
    if (last !== undefined && last[0] > save.tick) {
      ctx.addIssue({ code: "custom", path: ["log"], message: "log runs past the save tick" });
    }
  });

/**
 * The save a stored value describes, or null if it is not exactly a v1 save.
 * Never throws: an unknown version, a missing or extra key, a log the proof
 * parser refuses or a hostile object all come back as null.
 */
export function parseSave(raw: unknown): SaveV1 | null {
  if (typeof raw !== "object" || raw === null) return null;
  try {
    const proto: unknown = Object.getPrototypeOf(raw);
    if (proto !== Object.prototype && proto !== null) return null;
    // zod's strict check skips this one key, so refuse it by hand.
    if (Object.hasOwn(raw, "__proto__")) return null;
    const result = saveSchema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    // silent-ok: an object that throws when read (a Proxy) is not a save
    return null;
  }
}
