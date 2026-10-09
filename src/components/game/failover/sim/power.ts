// The power grid, the smallest model that makes watts a real decision: GPUs draw
// CONFIG.power.gpuDrawKw each, the base grid plus every placed Substation
// supplies capacity, and a GPU cannot be placed past the cap. That is the whole
// mechanic; the substation itself is unwireable (no edge rows, like Monitoring)
// and never takes traffic.
//
// recomputePower is ONE derivation over the live services, not call-site
// bookkeeping, so any path that builds or removes services (placement, demolish,
// a campaign prebuild, a restore) just re-derives and cannot leave it stale.
//
// The two gates live in topology (they are placement and demolish rules), but
// their predicates live here so the arithmetic can be pinned, most importantly
// that the placement gate is boundary INCLUSIVE: a build whose draw lands exactly
// on the cap is legal.

import { CONFIG } from "./config";
import { S } from "./state";

/** Re-derive S.power from the live service list. */
export function recomputePower(): void {
  let gpus = 0;
  let substations = 0;
  for (const s of S.services) {
    if (s.type === "gpu") gpus++;
    else if (s.type === "power") substations++;
  }
  S.power = {
    usedKw: gpus * CONFIG.power.gpuDrawKw,
    capKw: CONFIG.power.baseCapKw + substations * CONFIG.power.substationKw,
  };
}

/** Placement gate: can one more GPU go on the grid? A draw that lands exactly on the cap is allowed. */
export function hasPowerHeadroom(): boolean {
  return S.power.usedKw + CONFIG.power.gpuDrawKw <= S.power.capKw;
}

/**
 * Demolish gate: true when removing ONE substation would leave the powered GPUs
 * drawing more than the reduced cap supplies. Without it, buy-place-refund runs an
 * 18 kW fleet on an 8 kW cap forever. Removing a GPU stays free: shedding load is
 * always legal.
 */
export function substationRemovalStrandsGpus(): boolean {
  return S.power.usedKw > S.power.capKw - CONFIG.power.substationKw;
}
