// Scheduler / cron mechanic. The scheduler is the only node that is a traffic
// SOURCE, not a processor: it generates its OWN internal traffic in scheduled
// bursts (batch jobs at 03:00), independent of the external RPS the player
// controls. Nothing is routed into it; it emits.
//
// Ticked from Service.update with the step's dt, like every other timer in the
// sim. There is no handler registry entry for "scheduler".
//
// Every emitted request is a normal Request flown to a real downstream, so it
// terminates on that node's usual path. With no routable downstream the
// scheduler emits nothing at all: no stranded requests, no pointless failures.

import { CONFIG, TRAFFIC_TYPES } from "./config";
import { Request } from "./request";
import { isRoutable } from "./routing";
import type { Service } from "./service";
import { S } from "./state";

function routableTargets(service: Service): Service[] {
  return service.connections
    .map((id) => S.services.find((s) => s.id === id))
    .filter((s): s is Service => isRoutable(s));
}

// Inject one scheduled burst into the downstream, round-robin across every
// routable target so a scheduler wired to two queues splits its batch evenly.
function emitBurst(service: Service): void {
  const targets = routableTargets(service);
  if (targets.length === 0) return; // nowhere to send: skip the wave entirely

  const type = TRAFFIC_TYPES[service.config.burstType ?? "WRITE"];
  const count = service.config.burstSize ?? 6;
  for (let i = 0; i < count; i++) {
    const req = new Request(type);
    S.requests.push(req);
    const target = targets[i % targets.length];
    if (target) req.flyTo(target);
  }
}

/**
 * Advance the cron timer and fire a burst every intervalSec of game time. A
 * `while`, not an `if`, so a backlog of elapsed intervals is drained in order.
 */
export function tickScheduler(service: Service, dt: number): void {
  const interval = service.config.intervalSec ?? CONFIG.services.scheduler.intervalSec ?? 8;
  service.cronTimer += dt;
  while (service.cronTimer >= interval) {
    service.cronTimer -= interval;
    emitBurst(service);
  }
}
