import { describe, it, expect } from "vitest";
import { createCountdown, COUNTDOWN_MS } from "../countdown";

describe("createCountdown", () => {
  it("is idle until started and ticks null", () => {
    const c = createCountdown();
    expect(c.active()).toBe(false);
    expect(c.tick(5000)).toBeNull();
  });

  it("counts 3, 2, 1 in one-second steps then launches once", () => {
    expect(COUNTDOWN_MS).toBe(3000);
    const c = createCountdown();
    c.start(10_000);
    expect(c.active()).toBe(true);
    expect(c.tick(10_000)).toBe(3);
    expect(c.tick(10_999)).toBe(3);
    expect(c.tick(11_000)).toBe(2);
    expect(c.tick(11_999)).toBe(2);
    expect(c.tick(12_000)).toBe(1);
    expect(c.tick(12_999)).toBe(1);
    expect(c.tick(13_000)).toBe("launch");
    expect(c.active()).toBe(false);
    expect(c.tick(13_100)).toBeNull();
    expect(c.tick(20_000)).toBeNull();
  });

  it("never launches after a cancel", () => {
    const c = createCountdown();
    c.start(0);
    expect(c.tick(1500)).toBe(2);
    c.cancel();
    expect(c.active()).toBe(false);
    expect(c.tick(3000)).toBeNull();
    expect(c.tick(9000)).toBeNull();
  });

  it("can be restarted after finishing or cancelling", () => {
    const c = createCountdown();
    c.start(0);
    c.cancel();
    c.start(5000);
    expect(c.tick(5000)).toBe(3);
    expect(c.tick(8000)).toBe("launch");
  });

  it("launches on a late tick (a throttled tab) rather than skipping it", () => {
    const c = createCountdown();
    c.start(0);
    expect(c.tick(60_000)).toBe("launch");
  });
});
