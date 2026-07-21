import type { EventContext, EventDef, EventInstance } from "../types";
import { rangeInt } from "../rng";
import type { CampfireData } from "./campfire";

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
const IGNITE_MIN_BANNERS = 2; // chain 5: the fire only bothers with a real swarm
const IGNITE_MIN_FUEL = 50; // chain 5: a well-fed fire has heat to spare for a banner
const IGNITE_FUEL_COST = 15; // chain 5: fuel the fire spends burning one banner away

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
  fireUsedThisSwarm: boolean; // chain 5: the campfire has already burned a banner this swarm
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
  if (ordinal === 0) d.fireUsedThisSwarm = false; // the swarm's first banner opens a fresh burn budget
  const realOrdinal = Math.min(d.realRejectAt, MAX_BANNERS - 1);
  d.banners.push({ id: ordinal, hasRealReject: ordinal === realOrdinal });
}

/**
 * Chain 5: a well-fed campfire ignites one consent banner in a live swarm, a preview of
 * the finale's EULA burn. Reads the campfire via the sanctioned cross-event idiom (see
 * autocorrect.ts sabotage(), garden.ts swipeInvaders()): a fire in telegraph or done (or
 * not yet inited) is not a live actor, so the swarm behaves exactly as before. Fires once
 * per swarm (fireUsedThisSwarm, reset when the swarm's first banner spawns) and only when
 * the swarm is at least IGNITE_MIN_BANNERS deep and the fire is burning with fuel to spare.
 * The burn is the accepted minimum beat: the topmost banner is removed instantly with a
 * mood line and the existing paper sound (the chrome layer renders banners from this data
 * each frame, so a pre-removal CSS burn window would have to fight the render cycle). A
 * fixed fuel cost on already-deterministic data, so no rng enters play.
 */
function igniteBanner(d: CookieBannerData, ctx: EventContext): void {
  if (d.fireUsedThisSwarm || d.banners.length < IGNITE_MIN_BANNERS) return;
  const fire = ctx.state.events.find((e) => e.defId === "campfire");
  if (!fire || fire.phase === "telegraph" || fire.phase === "done" || fire.data === undefined) {
    return;
  }
  const f = fire.data as CampfireData;
  if (!f.burning || f.fuel < IGNITE_MIN_FUEL) return;
  f.fuel = Math.max(0, f.fuel - IGNITE_FUEL_COST);
  d.fireUsedThisSwarm = true;
  const burned = d.banners[d.banners.length - 1]!; // the topmost (last-spawned) banner catches
  d.banners = d.banners.filter((b) => b.id !== burned.id);
  ctx.emit({ kind: "sound", sound: "paper-shred" });
  ctx.emit({
    kind: "mood",
    eventId: EVENT_ID,
    text: "The campfire ignites a consent banner. The terms watch nervously.",
  });
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
    fireUsedThisSwarm: false,
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
    igniteBanner(d, ctx); // chain 5: a well-fed campfire burns one banner in a live swarm
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
