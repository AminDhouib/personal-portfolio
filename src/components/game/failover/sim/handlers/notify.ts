import { finishRequest } from "../actions";
import type { Service } from "../service";
import { S } from "../state";
import type { HandlerOutcome, Job } from "../types";

/**
 * Notification: a terminal sink like S3 or the DB, but the only terminal whose
 * SUCCESS grants reputation (user goodwill from a delivered notification) on top
 * of the usual reward. The other half, SILENT overload failures, lives in
 * Service.update's shared failure roll (see notifySilentFail), because that is
 * where a terminal node's only failures come from. It accepts any traffic type
 * and always completes it.
 */
export function process(service: Service, job: Job): HandlerOutcome {
  finishRequest(job.req, service);
  // Beyond the base SUCCESS_REPUTATION finishRequest applies: valuable even when
  // the money reward is small.
  S.reputation += service.config.repBonus ?? 0;
  return "next";
}
