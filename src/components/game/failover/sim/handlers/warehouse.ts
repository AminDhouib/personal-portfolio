// Data Warehouse. A pure terminal sink, like the DB, but with the INVERSE
// read/write profile: it COMPLETES analytics WRITES (WRITE and UPLOAD) and
// REJECTS realtime reads (anything else). A warehouse is OLAP, not OLTP: you load
// it, you do not serve user reads from it, so a read that reaches it is a
// modelling error and FAILS. The "slow and cheap at volume" half lives in config.
//
// It is fed by an analytics fan-out (a Pub/Sub copy) or a scheduled batch load
// (Scheduler ETL), both existing generic-forward sources.

import { failRequest, finishRequest } from "../actions";
import { TRAFFIC_TYPES } from "../config";
import { FAIL_REASONS } from "../failure-reasons";
import type { Service } from "../service";
import type { HandlerOutcome, Job } from "../types";

export function process(service: Service, job: Job): HandlerOutcome {
  const t = job.req.type;
  if (t === TRAFFIC_TYPES.WRITE || t === TRAFFIC_TYPES.UPLOAD) {
    // Analytics ingest: the one thing a warehouse is for.
    finishRequest(job.req, service);
  } else {
    // The badge says so in as many words: this is the OLTP-versus-OLAP lesson and
    // the one failure players most often read as a bug.
    failRequest(job.req, FAIL_REASONS.ANALYTICS_STORE);
  }
  return "next";
}
