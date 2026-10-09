// @vitest-environment node
import { describe, expect, it } from "vitest";
import { exp, log, pow } from "../dmath";

function rel(actual: number, expected: number): number {
  if (expected === 0) return Math.abs(actual);
  return Math.abs(actual - expected) / Math.abs(expected);
}

const TOL = 1e-12;

describe("dmath accuracy against Math over the ranges the sim uses", () => {
  it("log(1 + t/20) for t in 0..900 (the RPS ramp)", () => {
    for (let t = 0; t <= 900; t += 0.05) {
      const x = 1 + t / 20;
      expect(rel(log(x), Math.log(x))).toBeLessThan(TOL);
    }
  });

  it("pow(0.99, dt*60) for dt in 0..0.1 (the RPS smoothing)", () => {
    for (let dt = 0; dt <= 0.1; dt += 0.0005) {
      expect(rel(pow(0.99, dt * 60), Math.pow(0.99, dt * 60))).toBeLessThan(TOL);
    }
  });

  it("exp(-dt/tau) for tau in 0.1..10 (the load smoothing)", () => {
    for (let tau = 0.1; tau <= 10; tau += 0.1) {
      for (const dt of [0.05, 0.1, 0.5, 1]) {
        const x = -dt / tau;
        expect(rel(exp(x), Math.exp(x))).toBeLessThan(TOL);
      }
    }
  });

  it("is exact at the identities", () => {
    expect(exp(0)).toBe(1);
    expect(log(1)).toBe(0);
    expect(pow(0.99, 0)).toBe(1);
    expect(pow(1, 7.5)).toBe(1);
  });

  it("handles the edges without throwing", () => {
    expect(exp(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(exp(1000)).toBe(Number.POSITIVE_INFINITY);
    expect(exp(-1000)).toBe(0);
    expect(Number.isNaN(exp(NaN))).toBe(true);
    expect(log(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(Number.isNaN(log(-1))).toBe(true);
    expect(log(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(pow(0, 2)).toBe(0);
    expect(pow(0, -1)).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(pow(-2, 0.5))).toBe(true);
  });

  it("is monotonic where the sim relies on it", () => {
    let prevLog = log(1);
    let prevExp = exp(-3);
    for (let i = 1; i <= 400; i++) {
      const l = log(1 + i / 10);
      expect(l).toBeGreaterThan(prevLog);
      prevLog = l;
      const e = exp(-3 + i / 100);
      expect(e).toBeGreaterThan(prevExp);
      prevExp = e;
    }
  });
});

function bits(n: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, n);
  return view.getBigUint64(0).toString(16).padStart(16, "0");
}

// Pinned from this implementation. Addition, subtraction, multiplication,
// division and sqrt are correctly rounded by ECMAScript, and fused multiply-add
// is forbidden, so these patterns are the same in every engine. If one of them
// changes, a replay recorded before the change no longer verifies.
const PINNED: Array<[string, () => number, string]> = [
  ["log(1 + 0/20)", () => log(1 + 0 / 20), "0000000000000000"],
  ["log(1 + 1/20)", () => log(1 + 1 / 20), "3fa8fb063ef2c7f1"],
  ["log(1 + 20/20)", () => log(1 + 20 / 20), "3fe62e42fefa39ef"],
  ["log(1 + 60/20)", () => log(1 + 60 / 20), "3ff62e42fefa39ef"],
  ["log(1 + 180/20)", () => log(1 + 180 / 20), "40026bb1bbb55516"],
  ["log(1 + 300/20)", () => log(1 + 300 / 20), "40062e42fefa39ef"],
  ["log(1 + 600/20)", () => log(1 + 600 / 20), "400b78ce48912b5a"],
  ["log(1 + 900/20)", () => log(1 + 900 / 20), "400ea10ebd90426c"],
  ["pow(0.99, 0.05*60)", () => pow(0.99, 0.05 * 60), "3fef0cb07d0aed9a"],
  ["pow(0.99, 0.1*60)", () => pow(0.99, 0.1 * 60), "3fee209afa7055ec"],
  [
    "pow(0.99, 0.016666666666666666*60)",
    () => pow(0.99, 0.016666666666666666 * 60),
    "3fefae147ae147ae",
  ],
  ["exp(-0.05/2.5)", () => exp(-0.05 / 2.5), "3fef5dc99badec5b"],
  ["exp(-0.05/0.1)", () => exp(-0.05 / 0.1), "3fe368b2fc6f960a"],
  ["exp(-0.05/10)", () => exp(-0.05 / 10), "3fefd7246927d28b"],
  ["exp(-0.1/2.5)", () => exp(-0.1 / 2.5), "3feebec97e700b8d"],
  ["exp(-1/2.5)", () => exp(-1 / 2.5), "3fe57343067270ee"],
  ["exp(1)", () => exp(1), "4005bf0a8b14576a"],
  ["exp(-1)", () => exp(-1), "3fd78b56362cef38"],
  ["exp(0.5)", () => exp(0.5), "3ffa61298e1e069c"],
  ["exp(-5)", () => exp(-5), "3f7b993fe00d5376"],
];

describe("dmath pinned bit patterns", () => {
  it("has twenty pins", () => {
    expect(PINNED.length).toBe(20);
  });

  for (const [name, fn, hex] of PINNED) {
    it(`${name} is ${hex}`, () => {
      expect(bits(fn())).toBe(hex);
    });
  }
});
