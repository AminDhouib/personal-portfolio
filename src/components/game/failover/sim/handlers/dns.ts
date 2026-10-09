// GeoDNS. Chosen as the entry from the Internet (routeRequestToEntry prefers a DNS
// front door), then this handler RE-DISPATCHES the record across its own routable
// downstream front doors, one WAF / ALB / API gateway per independent regional
// stack, round-robin. Where an ALB balances workers WITHIN a single stack, DNS
// balances whole independent stacks at the very front: the basis for multi-region
// and regional failover.
//
// It never terminates a record itself: it forwards to a front door or, with no
// routable downstream, fails it (a wired DLQ may catch it), so nothing leaks.
// There is no cycle: DNS only forwards "down" into WAF/ALB/API gateway, none of
// which route back up to it.

import { failOrPark } from "../actions";
import { FAIL_REASONS } from "../failure-reasons";
import { isRoutable } from "../routing";
import type { Service } from "../service";
import { S } from "../state";
import type { HandlerOutcome, Job } from "../types";

export function process(service: Service, job: Job): HandlerOutcome {
  const stacks = service.connections
    .map((id) => S.services.find((s) => s.id === id))
    .filter((s): s is Service => isRoutable(s));

  const target = stacks[service.rrIndex % stacks.length];
  if (!target) {
    failOrPark(job.req, service, FAIL_REASONS.NO_ROUTE);
    return "next";
  }

  // Round-robin across the independent regional front doors.
  service.rrIndex++;
  job.req.flyTo(target);
  return "next";
}
