// @vitest-environment node
// Prioritized load shedding: the lesson, machine-proven.
//
// Before this, the API Gateway shed BLINDLY: everything past the rate limit was
// refused in arrival order, so what survived an overload was decided by topology and
// luck. The cheap traffic sailed through while the dear traffic died, and the player
// could not influence it by any means at all.
//
// Real systems classify traffic in ADVANCE (Google's CRITICAL vs SHEDDABLE_PLUS,
// Envoy's priority levels) precisely because nobody can make that call during an
// incident. This is that mechanic.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG, type TrafficType } from "../config";
import { resetSim, S } from "../state";
import { step } from "../tick";
import { connect, place, resetWorld, run } from "./helpers";

beforeEach(() => resetWorld());
afterEach(() => resetSim({ seed: "after-criticality" }));

// A board fronted by an API Gateway, which is the node that owns the policy.
function gatewayBoard() {
  resetWorld({ money: 1e9, seed: "criticality-board" });
  const waf = place("waf");
  const apigw = place("apigw");
  const alb = place("alb");
  const compute = place("compute");
  const db = place("db");
  const s3 = place("s3");
  const search = place("search");
  connect("internet", waf);
  connect(waf, apigw);
  connect(apigw, alb);
  connect(alb, compute);
  connect(compute, db);
  connect(compute, s3);
  connect(compute, search);
  if (!S.services.length) throw new Error("board did not build");
  return { apigw, compute };
}

// An even mix so the shed order is about POLICY, not about which class happens to
// be common.
const EVEN_MIX = {
  STATIC: 0.25,
  READ: 0.25,
  WRITE: 0.2,
  UPLOAD: 0.15,
  SEARCH: 0.15,
  MALICIOUS: 0,
  INFERENCE: 0,
};

// Run the SAME board and the SAME seeded traffic under a given policy. The blind
// policy (every class refused at the limit) is what the gateway did before, so the
// two runs differ only in the shed ORDER, which is the claim under test. Comparing
// absolute counts against each other instead would prove nothing: CRITICAL is 35%
// of this mix and SHEDDABLE 25%, so "more criticals survived" is true before the
// feature exists.
function runAt(
  rps: number,
  { policy, seconds = 40 }: { policy?: typeof CONFIG.shedding; seconds?: number } = {},
) {
  const original = CONFIG.shedding;
  if (policy) CONFIG.shedding = policy;
  try {
    gatewayBoard();
    S.currentRPS = rps;
    S.trafficDistribution = { ...EVEN_MIX };
    const before = { ...S.finances.income.countByType };
    run(seconds);
    const served: Partial<Record<TrafficType, number>> = {};
    for (const t of Object.keys(EVEN_MIX) as TrafficType[]) {
      served[t] = (S.finances.income.countByType[t] ?? 0) - (before[t] ?? 0);
    }
    return { served, income: +S.finances.income.total.toFixed(2) };
  } finally {
    CONFIG.shedding = original;
  }
}

const BLIND = { SHEDDABLE: 1.0, STANDARD: 1.0, CRITICAL: 1.0 };

describe("traffic classes are declared, not discovered", () => {
  it("every served class carries a criticality, and the policy knows it", () => {
    const policy: Record<string, number> = CONFIG.shedding;
    expect(policy.SHEDDABLE).toBeLessThan(policy.STANDARD ?? 0);
    expect(policy.STANDARD).toBeLessThan(policy.CRITICAL ?? 0);
    expect(policy.CRITICAL).toBe(1.0); // critical is carried to the last slot

    for (const [type, cfg] of Object.entries(CONFIG.trafficTypes)) {
      if (type === "MALICIOUS") continue; // never served, never classified
      if (type === "INFERENCE") {
        // Owns its own deadline mechanic at the Inference Gateway.
        expect(cfg.criticality).toBeDefined();
        continue;
      }
      expect(policy[cfg.criticality ?? ""], `${type} has an unknown class`).toBeDefined();
    }
  });

  it("the money and the class agree: nothing cheap outranks something dear", () => {
    // Not a tautology: it is the design constraint. If a SHEDDABLE class ever paid
    // more than a CRITICAL one, the gateway would be protecting the wrong revenue
    // and the lesson would invert.
    const rank = { SHEDDABLE: 0, STANDARD: 1, CRITICAL: 2 };
    const served = Object.entries(CONFIG.trafficTypes).filter(
      ([t, c]) => t !== "MALICIOUS" && c.criticality,
    );
    for (const [ta, ca] of served) {
      for (const [tb, cb] of served) {
        if (!ca.criticality || !cb.criticality) continue;
        if (rank[ca.criticality] > rank[cb.criticality]) {
          expect(ca.reward, `${ta} outranks ${tb} but pays less`).toBeGreaterThanOrEqual(cb.reward);
        }
      }
    }
  });
});

describe("THE LESSON: the shed order is a decision, not an accident", () => {
  it("at mild overload the policy earns MORE than shedding blindly", () => {
    // Derived from the gateway's OWN limit, not a hardcoded rps, so the test
    // measures the mechanism at a fixed overload RATIO and can never drift from the
    // config. About 1.5x the limit: past the SHEDDABLE and STANDARD thresholds
    // (0.6 and 0.85 of the limit) so the cheap classes are refused early, freeing
    // downstream slots for traffic worth more.
    const limit = CONFIG.services.apigw.rateLimit ?? 20;
    const rps = Math.round(1.5 * limit);
    const blind = runAt(rps, { policy: BLIND });
    const tiered = runAt(rps);
    expect(tiered.served.STATIC ?? 0).toBeLessThan(blind.served.STATIC ?? 0);
    expect(tiered.income).toBeGreaterThan(blind.income);
  });

  it("at DEEP overload it protects what was declared critical, and that costs something", () => {
    // About 2x the gateway's own limit. Here the honest result is a trade, not a
    // free win: CRITICAL survival is bought with SHEDDABLE traffic AND with some
    // SEARCH, which is STANDARD despite paying well. That is the consequence of
    // classifying by ROLE (a transaction outranks a query) rather than by price
    // list, and it is the decision the player is being taught to make in advance. A
    // policy is a choice about what to lose, not a way to lose less.
    const limit = CONFIG.services.apigw.rateLimit ?? 20;
    const rps = Math.round(2.0 * limit);
    const blind = runAt(rps, { policy: BLIND });
    const tiered = runAt(rps);

    const criticalTiered = (tiered.served.WRITE ?? 0) + (tiered.served.UPLOAD ?? 0);
    const criticalBlind = (blind.served.WRITE ?? 0) + (blind.served.UPLOAD ?? 0);
    expect(criticalTiered).toBeGreaterThan(criticalBlind);
    expect(tiered.served.STATIC ?? 0).toBeLessThan(blind.served.STATIC ?? 0);
  });

  it("a healthy board sheds nothing at all: the policy is invisible below the limit", () => {
    // If the classes cost anything when there is headroom, this would be a tax on
    // playing rather than a lesson about pressure.
    const r = runAt(4);
    for (const type of Object.keys(EVEN_MIX) as TrafficType[]) {
      if ((EVEN_MIX[type] ?? 0) > 0) {
        expect(r.served[type] ?? 0, `${type} should be served freely at low load`).toBeGreaterThan(
          0,
        );
      }
    }
    expect(r.served.STATIC ?? 0).toBeGreaterThan(0); // the first class to be shed is fine here
  });

  it("shedding stays a SOFT fail: it never trips the breaker", () => {
    // Throttling is the gateway working as designed. If it fed the breaker,
    // protecting revenue would look like a broken gateway and the node would take
    // itself out of rotation for doing its job.
    const { apigw } = gatewayBoard();
    S.currentRPS = 30;
    S.trafficDistribution = { ...EVEN_MIX };
    step(40 * 20);
    expect(apigw.breakerState).toBe("closed");
  });
});
