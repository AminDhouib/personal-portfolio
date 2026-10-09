// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { rand, seedStreams, type Stream } from "../rng";

const STREAMS: Stream[] = ["traffic", "events", "rolls"];

function draw(stream: Stream, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rand(stream));
  return out;
}

afterEach(() => seedStreams("reset"));

describe("sim rng streams", () => {
  for (const stream of STREAMS) {
    it(`${stream}: the same seed gives the same first 1000 draws`, () => {
      seedStreams("seed-a");
      const first = draw(stream, 1000);
      seedStreams("seed-a");
      expect(draw(stream, 1000)).toEqual(first);
    });

    it(`${stream}: draws stay in [0, 1)`, () => {
      seedStreams("seed-a");
      for (const v of draw(stream, 1000)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });

    it(`${stream}: a different seed gives a different sequence`, () => {
      seedStreams("seed-a");
      const a = draw(stream, 50);
      seedStreams("seed-b");
      expect(draw(stream, 50)).not.toEqual(a);
    });
  }

  it("the three streams are distinct from one another", () => {
    seedStreams("seed-a");
    const [t, e, r] = STREAMS.map((s) => draw(s, 20));
    expect(t).not.toEqual(e);
    expect(e).not.toEqual(r);
    expect(t).not.toEqual(r);
  });

  it("streams are independent: drawing from rolls does not move traffic", () => {
    seedStreams("seed-a");
    const clean = draw("traffic", 100);
    seedStreams("seed-a");
    draw("rolls", 777);
    draw("events", 321);
    expect(draw("traffic", 100)).toEqual(clean);
  });

  it("re-seeding restarts every stream, wherever it had got to", () => {
    seedStreams("seed-a");
    const fresh = STREAMS.map((s) => draw(s, 10));
    for (const s of STREAMS) draw(s, 500);
    seedStreams("seed-a");
    expect(STREAMS.map((s) => draw(s, 10))).toEqual(fresh);
  });

  it("pins the first draws so the seeding recipe cannot drift silently", () => {
    seedStreams("failover-pin");
    expect(STREAMS.map((s) => rand(s))).toEqual([
      0.22602397319860756, 0.5932455596048385, 0.9870923405978829,
    ]);
  });
});
