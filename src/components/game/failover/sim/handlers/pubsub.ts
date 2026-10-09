// Pub/Sub topic. The ONLY handler that MULTIPLIES requests: an inbound request
// fans out to one delivery per connected subscriber. The original is delivered to
// the first subscriber; one CLONE is minted for every additional subscriber.
// Fan-out is capped at the subscriber count by construction, so it cannot explode.
//
// Every copy is a real Request that must terminate exactly once:
//   - the ORIGINAL is consumed here by being flown to subscriber #0;
//   - each CLONE is pushed into S.requests and flown to its own subscriber;
//   - with NO routable subscriber the original is failed (or parked in a wired
//     DLQ), never left hanging.
// Cloning happens BEFORE the original is re-flown so the clone copies a clean
// origin, and clones are plain Requests of the same traffic type.

import { failOrPark } from "../actions";
import { FAIL_REASONS } from "../failure-reasons";
import { Request } from "../request";
import { isRoutable } from "../routing";
import type { Service } from "../service";
import { S } from "../state";
import type { HandlerOutcome, Job } from "../types";

export function process(service: Service, job: Job): HandlerOutcome {
  const subs = service.connections
    .map((id) => S.services.find((s) => s.id === id))
    .filter((s): s is Service => isRoutable(s));

  const first = subs[0];
  if (!first) {
    // No subscriber to deliver to: fail the event (a wired DLQ may catch it).
    failOrPark(job.req, service, FAIL_REASONS.NO_SUBSCRIBER);
    return "next";
  }

  // One clone per ADDITIONAL subscriber.
  for (const sub of subs.slice(1)) {
    const clone = new Request(job.req.type);
    // A DELIVERY, NOT AN ARRIVAL. The clone must terminate like any request, but
    // it is not a second customer: marking it here is what stops updateScore
    // paying for it. Wiring a second and third subscriber used to triple the
    // money and the score from unchanged customer traffic, which is fan-out
    // backwards: real fan-out costs MORE per event and is not paid more for it.
    clone.isFanoutCopy = true;
    S.requests.push(clone);
    clone.flyTo(sub);
  }

  // The original becomes subscriber #0's delivery.
  job.req.flyTo(first);
  return "next";
}
