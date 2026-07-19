import type { EventContext, EventDef, EventInstance } from "../types";
import { rangeInt } from "../rng";

/**
 * The cookie banner from hell. A telegraph, then a single consent dialog appears.
 * Every "Decline" spawns TWO more banners (a corporate hydra), capped at five. Only
 * ONE banner in the whole stack carries the real "Reject all" link — the seed picks
 * its spawn ORDINAL (0-based) up front; the rest show a decorative button. Clicking
 * the real reject-all dismisses the swarm; clicking a fake one does nothing. Left
 * alone, the session "expires" after 60s and the banners slink away on their own.
 * Typing is NEVER locked — the swarm is a pointer nuisance, not an input stun.
 */

const EVENT_ID = "cookie-banner";
const TELEGRAPH_MS = 3000;
const MAX_BANNERS = 5;
const DEADLINE_MS = 60_000;

/** One consent dialog. `hasRealReject` is fixed at spawn from the ordinal. */
export interface Banner {
  id: number; // the 0-based spawn ordinal, also its stable identity for the stage
  hasRealReject: boolean;
}

export interface CookieBannerData {
  banners: Banner[];
  realRejectAt: number; // the ordinal (0..4) whose banner carries the real reject
  dismissed: boolean; // true once the real reject-all was clicked
  deadlineAtMs: number; // state.elapsedMs the session expires and the swarm leaves
}

/**
 * Spawn the next banner (its ordinal is the current stack size). The real-reject
 * ordinal is clamped into the reachable range [0, MAX_BANNERS - 1]: rangeInt(0, 4)
 * already lands there, so the clamp is defensive — were realRejectAt ever to exceed
 * the cap, the LAST (fifth) banner would carry the real link, guaranteeing that a
 * player who declines to the cap can always reach a real reject. Reachability holds
 * regardless: onset spawns ordinal 0, and two declines fill ordinals 1..4.
 */
function spawnBanner(d: CookieBannerData): void {
  const ordinal = d.banners.length;
  const realOrdinal = Math.min(d.realRejectAt, MAX_BANNERS - 1);
  d.banners.push({ id: ordinal, hasRealReject: ordinal === realOrdinal });
}

export const cookieBannerDef: EventDef<CookieBannerData> = {
  id: EVENT_ID,
  family: "chrome",
  telegraphMs: TELEGRAPH_MS,
  init: (rng) => ({
    banners: [],
    realRejectAt: rangeInt(rng, 0, 4),
    dismissed: false,
    deadlineAtMs: 0,
  }),
  onTick(inst: EventInstance<CookieBannerData>, ctx: EventContext): void {
    const d = inst.data;
    if (inst.phase === "telegraph") {
      if (inst.phaseElapsedMs >= TELEGRAPH_MS) {
        inst.phase = "onset";
        spawnBanner(d); // banner ordinal 0
        d.deadlineAtMs = ctx.state.elapsedMs + DEADLINE_MS;
        ctx.emit({ kind: "sound", sound: "chrome-onset" });
      }
      return;
    }
    if (inst.phase === "onset") inst.phase = "peak";
    // The session expires: the swarm slinks away untouched. (dismissed stays false —
    // the player never actually consented; it timed out.)
    if (!d.dismissed && ctx.state.elapsedMs >= d.deadlineAtMs) {
      d.banners = [];
      inst.phase = "done";
      ctx.emit({ kind: "toast", tone: "info", text: "Session expired. The banners slink away." });
    }
  },
  onPointer(inst: EventInstance<CookieBannerData>, ctx: EventContext, target): boolean {
    const d = inst.data;
    if (target.kind === "banner-decline") {
      // Declining breeds two more, up to the cap. The hydra grows.
      for (let i = 0; i < 2 && d.banners.length < MAX_BANNERS; i++) spawnBanner(d);
      return true;
    }
    if (target.kind === "banner-reject-all") {
      const id = typeof target.id === "number" ? target.id : -1;
      const banner = d.banners.find((b) => b.id === id);
      if (banner?.hasRealReject) {
        d.dismissed = true;
        inst.phase = "done";
        ctx.emit({ kind: "sound", sound: "paper-shred" });
        ctx.emit({ kind: "toast", tone: "success", text: "Preferences saved. All 847 of them." });
        return true;
      }
      // A reject-all on a fake banner (the stage should only render the link on the
      // real one; this is defensive). Consumed, but it does nothing.
      ctx.emit({ kind: "toast", tone: "info", text: "That button is decorative." });
      return true;
    }
    return false;
  },
  isResolved: (inst) => inst.phase === "done",
};
