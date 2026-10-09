// Dead-letter queue drain. The park half is dlq-park.ts (see the note there on
// why they are two files). The DLQ sits outside the job pipeline: it is ticked
// directly from Service.update and has no handler registry entry.

import { removeRequest } from "./actions";
import type { Service } from "./service";
import { emit, S } from "./state";

/**
 * Automatic slow drain, ticked once per step. Each drained request is RECOVERED:
 * removed cleanly (neither success nor failure) at a money cost, refunding a
 * little reputation. Never gated on money, because a drain must always make
 * progress or parked requests would leak; spending into the red is a real
 * survival cost, exactly like upkeep.
 */
export function tickDLQ(dlq: Service, dt: number): void {
  if (dlq.parked.length === 0) return;
  dlq.drainTimer += dt;
  const interval = dlq.config.drainIntervalSec ?? 0.6;
  const cost = dlq.config.drainCost ?? 0;
  while (dlq.drainTimer >= interval) {
    const req = dlq.parked.shift();
    if (!req) break;
    dlq.drainTimer -= interval;
    S.resilience.drained++;
    S.money -= cost;
    S.reputation += dlq.config.drainRepRefund ?? 0;
    // Its own line: booking it as DDoS mitigation made a board with a busy
    // dead-letter queue and no attack traffic grow a DDoS line, and hid the
    // DLQ's real running cost.
    S.finances.expenses.dlq += cost;
    removeRequest(req);
    emit({ kind: "request-recovered", id: req.id, dlqId: dlq.id });
  }
}
