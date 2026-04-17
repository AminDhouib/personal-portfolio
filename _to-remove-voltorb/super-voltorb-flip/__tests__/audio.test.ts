import { describe, it, expect, vi } from "vitest";
import { STINGERS, synthStinger } from "../audio";

describe("STINGERS table", () => {
  it("defines all required stinger kinds", () => {
    expect(STINGERS).toHaveProperty("win");
    expect(STINGERS).toHaveProperty("lose");
    expect(STINGERS).toHaveProperty("levelUp");
    expect(STINGERS).toHaveProperty("tileFlip");
    expect(STINGERS).toHaveProperty("explosion");
    expect(STINGERS).toHaveProperty("coinTick");
    expect(STINGERS).toHaveProperty("shieldAbsorb");
    expect(STINGERS).toHaveProperty("voltorbReveal");
  });

  it("every stinger has at least one note", () => {
    for (const [, notes] of Object.entries(STINGERS)) {
      expect(notes.length).toBeGreaterThan(0);
    }
  });
});

describe("synthStinger", () => {
  it("schedules oscillators for each note", () => {
    const scheduled: number[] = [];
    const ctx = {
      currentTime: 0,
      destination: {},
      createOscillator: () => ({
        frequency: { setValueAtTime: vi.fn() },
        detune: { setValueAtTime: vi.fn() },
        type: "sine",
        connect: vi.fn(),
        start: vi.fn((t: number) => scheduled.push(t)),
        stop: vi.fn(),
      }),
      createGain: () => ({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      }),
    } as unknown as AudioContext;

    synthStinger(ctx, "win");
    expect(scheduled.length).toBe(STINGERS.win.length);
  });
});
