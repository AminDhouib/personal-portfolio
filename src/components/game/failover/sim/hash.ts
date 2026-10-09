import { fnv1a } from "../../password-game-2/engine/rng";
import { S } from "./state";

/**
 * A fingerprint of the live sim: FNV-1a over everything a replay must reproduce
 * (money, reputation, score, counts, the board's layout and wiring, and every
 * service's health and queues).
 * Two runs that agree on this agree on how the run went. Number-to-string is
 * exact and engine-independent in ECMAScript, so the hash is too.
 */
export function stateHash(): number {
  const parts: Array<string | number> = [
    S.tick,
    S.money,
    S.reputation,
    S.score.total,
    S.requestsProcessed,
    S.lateCompletions,
    S.requests.length,
    S.currentRPS,
    S.over ? S.over.reason : "live",
    S.over ? S.over.atTick : -1,
    S.autoRepairEnabled ? 1 : 0,
  ];
  for (const s of S.services) {
    parts.push(s.id, s.type, s.position.x, s.position.z, s.tier, s.health);
    parts.push(
      s.queue.length,
      s.processing.length,
      s.smoothedLoad,
      s.asgEnabled ? 1 + s.instances : 0,
    );
  }
  // Wiring in the order it was made: a replay that links differently plays differently.
  for (const c of S.connections) parts.push(`${c.from}>${c.to}`);
  for (const key of Object.keys(S.failures).sort()) {
    parts.push(key, S.failures[key as keyof typeof S.failures]);
  }
  return fnv1a(parts.join("|"));
}
