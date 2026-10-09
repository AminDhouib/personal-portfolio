import { ARCADE_VERIFY_BUDGET_MS, type ArcadeVerdict, type ArcadeVerify } from "./games";

/** The reason a client sees when a verifier fails closed; the real cause is reported, not sent. */
export const VERIFY_FAILED_REASON = "could not verify the run";

export { VERIFY_BUSY_REASON } from "./verify-reasons";

export type VerifyOutcome = ArcadeVerdict | { ok: false; reason: string; error: Error };

type Settled = { verdict: unknown } | { error: Error } | { timedOut: true };

function isVerdict(value: unknown): value is ArcadeVerdict {
  if (typeof value !== "object" || value === null || !("ok" in value)) return false;
  if (value.ok === true) return true;
  return value.ok === false && "reason" in value && typeof value.reason === "string";
}

function failure(error: Error): VerifyOutcome {
  return { ok: false, reason: VERIFY_FAILED_REASON, error };
}

/**
 * Runs a game's verifier under the budget and never throws. A verdict is returned as is. A
 * verifier that throws, rejects, answers something that is not a verdict, returns after its
 * deadline, or never settles comes back as a reject with the generic reason and the cause in
 * `error` for the caller to report. A timer alone cannot stop synchronous work, so the deadline
 * is also handed to the verifier and checked again on return.
 */
export async function runVerifier(
  verify: ArcadeVerify,
  input: { score: number; detail: Record<string, number>; proof: string | null; now: Date },
): Promise<VerifyOutcome> {
  const deadline = Date.now() + ARCADE_VERIFY_BUDGET_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Neither side of the race can reject, so a verifier that fails after the timer won has no
  // unhandled rejection to leave behind.
  const attempt = (async (): Promise<Settled> => {
    try {
      return { verdict: await verify({ ...input, deadline }) };
    } catch (error) {
      // silent-ok: returned as the outcome, which the route reports
      return { error: error instanceof Error ? error : new Error(String(error)) };
    }
  })();
  const budget = new Promise<Settled>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ARCADE_VERIFY_BUDGET_MS);
  });
  const settled = await Promise.race([attempt, budget]);
  clearTimeout(timer);

  if ("timedOut" in settled || Date.now() > deadline) {
    return failure(new Error(`arcade verifier exceeded its ${ARCADE_VERIFY_BUDGET_MS} ms budget`));
  }
  if ("error" in settled) return failure(settled.error);
  if (!isVerdict(settled.verdict)) {
    return failure(new Error("arcade verifier returned something that is not a verdict"));
  }
  return settled.verdict;
}
