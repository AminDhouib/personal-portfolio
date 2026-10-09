// @vitest-environment node
// Two panels that printed a number describing something other than what the row above
// it said, data side only (the DOM renderers are the view's).
//
// TOTAL SCORE sits directly on top of three rows (Storage, Database, Attacks Blocked)
// and updateScore moved the total on three paths while touching a row on only two.
// The FAILED branch took `score.total -= score / 2` with no row at all, so adding the
// rows up gave a different number from the total above them.
//
// The dead-letter queue's drain cost was booked into expenses.mitigation, whose single
// renderer prints "DDoS Mitigation". A board with a busy DLQ and no attack traffic at
// all grew a DDoS line, and the DLQ's real running cost, the thing that makes it a
// trade rather than a free undo, was invisible.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { failRequest, finishRequest } from "../actions";
import { CONFIG } from "../config";
import { tickDLQ } from "../dlq";
import { parkInDLQ } from "../dlq-park";
import { Request } from "../request";
import { resetSim, S } from "../state";
import { connect, place, resetWorld } from "./helpers";

beforeEach(() => resetWorld({ mode: "survival" }));
afterEach(() => resetSim({ seed: "after-panels" }));

const rowsSum = (): number =>
  S.score.storage + S.score.database + S.score.maliciousBlocked - S.score.penalties;

function request(): Request {
  const req = new Request("READ");
  S.requests.push(req);
  return req;
}

describe("the scoreboard adds up", () => {
  it("THE CONTRADICTION: a failure moved the total and no row", () => {
    const db = place("db");
    for (let i = 0; i < 4; i++) {
      const ok = request();
      ok.age = 0.1;
      finishRequest(ok, db);
    }
    expect(rowsSum()).toBe(S.score.total);

    for (let i = 0; i < 3; i++) failRequest(request());
    expect(S.score.penalties, "the failures cost something").toBeGreaterThan(0);
    expect(rowsSum(), "the rows no longer add up to the total above them").toBeCloseTo(
      S.score.total,
      9,
    );
  });

  it("...and a clean run has nothing to explain", () => {
    const db = place("db");
    const ok = request();
    ok.age = 0.1;
    finishRequest(ok, db);
    expect(S.score.penalties).toBe(0);
    expect(rowsSum()).toBe(S.score.total);
  });
});

describe("the expense ledger names what it charged for", () => {
  it("A DLQ DRAIN IS NOT A DDoS: it bills under its own line", () => {
    const compute = place("compute");
    const dlq = place("dlq");
    connect(compute, dlq);
    for (let i = 0; i < 5; i++) expect(parkInDLQ(request(), compute)).toBe(true);
    for (let t = 0; t < 60 && dlq.parked.length > 0; t++) tickDLQ(dlq, 0.6);
    expect(dlq.parked, "the queue really did drain").toHaveLength(0);

    const e = S.finances.expenses;
    expect(e.dlq, "the drains cost money").toBeGreaterThan(0);
    expect(e.dlq).toBeCloseTo(5 * (CONFIG.services.dlq.drainCost ?? 0), 6);
    // ...and no attack ever happened on this board.
    expect(e.mitigation, "a DDoS line appeared with no attack traffic").toBe(0);
  });

  it("...and the money still balances: the line is exactly what left the account", () => {
    const compute = place("compute");
    const dlq = place("dlq");
    connect(compute, dlq);
    const before = S.money;
    const drains = Math.ceil(4 / (CONFIG.services.dlq.drainCost ?? 0.5));
    for (let i = 0; i < drains; i++) expect(parkInDLQ(request(), compute)).toBe(true);
    for (let t = 0; t < 400 && dlq.parked.length > 0; t++) tickDLQ(dlq, 0.6);
    expect(dlq.parked).toHaveLength(0);

    const e = S.finances.expenses;
    expect(e.dlq, "the drain charged something").toBeGreaterThan(0);
    // Each recovered request also refunds a little standing, not money, so the account
    // moved by the drain cost and nothing else.
    expect(before - S.money).toBeCloseTo(e.dlq, 9);
  });
});
