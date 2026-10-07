import { describe, it, expect } from "vitest";
import {
  clockSeconds,
  endClock,
  newRoundClock,
  pauseClock,
  resumeClock,
  startClock,
} from "../round-clock";

describe("round clock", () => {
  it("counts nothing before the first action", () => {
    expect(clockSeconds(newRoundClock(), 99000)).toBe(0);
  });

  it("does not start while the tab is hidden", () => {
    const c = startClock(newRoundClock(), 0, true);
    expect(c.started).toBe(false);
    expect(clockSeconds(resumeClock(c, 5000), 9000)).toBe(0);
  });

  it("counts from the first action and ignores later starts", () => {
    let c = startClock(newRoundClock(), 1000, false);
    c = startClock(c, 8000, false);
    expect(clockSeconds(c, 11000)).toBe(10);
  });

  it("banks visible time across a hidden stretch", () => {
    let c = startClock(newRoundClock(), 0, false);
    c = pauseClock(c, 10000);
    expect(clockSeconds(c, 110000)).toBe(10);
    c = resumeClock(c, 110000);
    expect(clockSeconds(c, 115000)).toBe(15);
  });

  it("freezes at the end and does not resume or restart", () => {
    let c = startClock(newRoundClock(), 0, false);
    c = endClock(c, 4000);
    c = resumeClock(c, 9000);
    c = startClock(c, 9000, false);
    expect(clockSeconds(c, 50000)).toBe(4);
  });
});
