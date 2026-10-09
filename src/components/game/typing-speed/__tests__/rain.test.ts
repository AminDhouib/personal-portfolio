// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  RAIN_LIVES,
  createRain,
  rainAccuracy,
  rainWpm,
  tickRain,
  typeRain,
  waveParams,
} from "../engine/rain";

describe("rain", () => {
  it("is deterministic for a seed", () => {
    const a = createRain(5);
    const b = createRain(5);
    for (let i = 0; i < 100; i++) {
      tickRain(a, 50);
      tickRain(b, 50);
    }
    expect(a).toEqual(b);
  });
  it("takes its spawns from the seed", () => {
    const first = (seed: number) => {
      const r = createRain(seed);
      tickRain(r, 1);
      return r.words[0]!;
    };
    expect(first(5)).toMatchObject({ text: "hard" });
    expect(first(5).x).toBeCloseTo(0.5909, 4);
    expect(first(6)).toMatchObject({ text: "few" });
    const run = (seed: number) => {
      const r = createRain(seed);
      for (let i = 0; i < 100; i++) tickRain(r, 50);
      return r.words.map((w) => `${w.text}@${w.x.toFixed(3)}`);
    };
    expect(run(5)).not.toEqual(run(6));
  });
  it("spawns on the wave interval", () => {
    const r = createRain(1);
    const { spawnMs } = waveParams(1);
    tickRain(r, 1);
    expect(r.words).toHaveLength(1);
    tickRain(r, spawnMs - 2);
    expect(r.words).toHaveLength(1);
    tickRain(r, 2);
    expect(r.words).toHaveLength(2);
  });
  it("a word reaching the floor costs a life; the last life ends the run", () => {
    const r = createRain(2);
    tickRain(r, 1);
    const fall = 1000 / waveParams(1).speed; // 12500 ms to fall the whole area at wave 1
    for (let t = 0; t < fall; t += 50) tickRain(r, 50);
    expect(r.lives).toBe(RAIN_LIVES - 1); // only the first word has landed
    for (let t = 0; t < 60_000 && r.status !== "over"; t += 50) tickRain(r, 50);
    expect(r).toMatchObject({ status: "over", lives: 0 });
    const words = r.words.length;
    tickRain(r, 10_000);
    expect(r.words).toHaveLength(words); // frozen after game over
  });
  it("typing a falling word clears the lowest match and scores its letters", () => {
    const r = createRain(3);
    tickRain(r, 1);
    const target = r.words[0]!;
    expect(typeRain(r, target.text.slice(0, 1))).toEqual({ cleared: false, valid: true });
    expect(typeRain(r, target.text)).toEqual({ cleared: true, valid: true });
    expect(r.words.find((w) => w.id === target.id)).toBeUndefined();
    expect(r.score).toBe(target.text.length);
    expect(r.cleared).toBe(1);
  });
  it("a buffer that matches no falling word is invalid", () => {
    const r = createRain(3);
    tickRain(r, 1);
    expect(typeRain(r, "zzzzzz").valid).toBe(false);
  });
  it("no two live words share a text, and early waves use short words", () => {
    const r = createRain(4);
    for (let i = 0; i < 400; i++) tickRain(r, 25);
    const texts = r.words.map((w) => w.text);
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts.every((t) => t.length <= 4)).toBe(true);
  });
  it("never lets one live word start another, so a buffer maps to one word", () => {
    const r = createRain(6);
    for (let i = 0; i < 1200; i++) {
      tickRain(r, 25);
      r.lives = RAIN_LIVES; // keep the run going
      r.status = "running";
      const texts = r.words.map((w) => w.text);
      for (const a of texts)
        for (const b of texts) if (a !== b) expect(b.startsWith(a)).toBe(false);
    }
  });
  it("matches the lowest falling word when two share a first letters", () => {
    const r = createRain(7);
    r.words = [
      { id: 1, text: "stone", x: 0.1, y: 0.2 },
      { id: 2, text: "stair", x: 0.5, y: 0.6 },
    ];
    expect(typeRain(r, "sta")).toEqual({ cleared: false, valid: true });
    expect(typeRain(r, "stair")).toEqual({ cleared: true, valid: true });
    expect(r.words.map((w) => w.id)).toEqual([1]);
  });
  it("every 10 cleared words raises the wave, and waves get faster", () => {
    expect(waveParams(2).spawnMs).toBeLessThan(waveParams(1).spawnMs);
    expect(waveParams(2).speed).toBeGreaterThan(waveParams(1).speed);
    expect(waveParams(50).spawnMs).toBeGreaterThanOrEqual(700);
    expect(waveParams(1).maxLen).toBe(4);
    expect(waveParams(2).maxLen).toBe(6);
    expect(waveParams(4).maxLen).toBe(12);
    const r = createRain(8);
    for (let i = 0; i < 10; i++) {
      r.words = [{ id: 100 + i, text: "zq", x: 0.1, y: 0 }];
      typeRain(r, "zq");
      expect(r.wave).toBe(i < 9 ? 1 : 2);
    }
  });
  it("counts every letter typed and every miss for accuracy, and the WPM over the run", () => {
    const r = createRain(9);
    r.words = [{ id: 1, text: "ab", x: 0.1, y: 0 }];
    r.elapsedMs = 60_000;
    expect(rainAccuracy(r)).toBe(100);
    typeRain(r, "x"); // a miss
    typeRain(r, "a");
    typeRain(r, "ab");
    expect(rainAccuracy(r)).toBe(67); // 2 of 3
    expect(rainWpm(r)).toBe(0); // 2 letters in a minute is under half a word
    r.score = 100;
    expect(rainWpm(r)).toBe(20);
  });
  it("counts the time it was ticked for", () => {
    const r = createRain(1);
    tickRain(r, 1000);
    expect(r.elapsedMs).toBe(1000);
  });
});
