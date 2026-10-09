import { fnv1a } from "../../password-game-2/engine/rng";
import { S } from "./state";

/**
 * A fingerprint of the live sim: FNV-1a over everything a replay must reproduce
 * (money, reputation, score, counts, and every service's health and queues).
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
  ];
  for (const s of S.services) {
    parts.push(s.id, s.type, s.tier, s.health, s.queue.length, s.processing.length, s.smoothedLoad);
  }
  for (const key of Object.keys(S.failures).sort()) {
    parts.push(key, S.failures[key as keyof typeof S.failures]);
  }
  return fnv1a(parts.join("|"));
}
