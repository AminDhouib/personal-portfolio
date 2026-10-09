// Deterministic exp, log and pow, built only from + - * / and comparisons.
//
// ECMAScript requires those operators to be correctly rounded IEEE 754 double
// arithmetic and forbids fused multiply-add, so every engine computes the same
// bits. Math.exp, Math.log and Math.pow carry no such promise (they may differ
// by one ulp between V8, SpiderMonkey and JavaScriptCore), and the server
// replays a run that was recorded in the player's browser. Math.round and
// Math.min are exact and are allowed.

const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.442695040888963387;
const SQRT2 = 1.4142135623730951;
const SQRT1_2 = 0.7071067811865476;

// 1/n! for n = 0..14, by exact factorials and one correctly rounded division.
const INV_FACT: number[] = [];
{
  let f = 1;
  for (let i = 0; i <= 14; i++) {
    if (i > 0) f *= i;
    INV_FACT.push(1 / f);
  }
}

// 2^n for an integer n, exact (squaring a power of two never rounds).
function pow2(n: number): number {
  let base = n < 0 ? 0.5 : 2;
  let m = n < 0 ? -n : n;
  let result = 1;
  while (m > 0) {
    if (m % 2 === 1) result *= base;
    base *= base;
    m = Math.floor(m / 2);
  }
  return result;
}

export function exp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709.78) return Infinity;
  if (x < -745.2) return 0;
  // x = k*ln2 + r with |r| <= ln2/2, then exp(r) by a degree-14 Taylor series.
  const k = Math.round(x * INV_LN2);
  const r = x - k * LN2_HI - k * LN2_LO;
  let p = INV_FACT[14] as number;
  for (let i = 13; i >= 0; i--) p = p * r + (INV_FACT[i] as number);
  const half = Math.floor(k / 2);
  return p * pow2(half) * pow2(k - half);
}

export function log(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  // x = m * 2^e with m in [sqrt(1/2), sqrt(2)); the scalings are exact.
  let m = x;
  let e = 0;
  while (m >= SQRT2) {
    m /= 2;
    e++;
  }
  while (m < SQRT1_2) {
    m *= 2;
    e--;
  }
  // log(m) = 2 * atanh(s), s = (m - 1) / (m + 1), |s| <= 0.1716.
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let p = 1 / 25;
  for (let d = 23; d >= 1; d -= 2) p = p * s2 + 1 / d;
  const logM = 2 * s * p;
  if (e === 0) return logM;
  return e * LN2_HI + (logM + e * LN2_LO);
}

/** a^b for a > 0 (the only case the sim needs). */
export function pow(a: number, b: number): number {
  if (b === 0 || a === 1) return 1;
  if (a !== a || b !== b) return NaN;
  if (a < 0) return NaN;
  if (a === 0) return b > 0 ? 0 : Infinity;
  return exp(b * log(a));
}
