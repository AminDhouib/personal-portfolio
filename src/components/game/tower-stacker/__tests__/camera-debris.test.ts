// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cameraTarget, stepCamera } from "../camera";
import { spawnDebris, stepDebris } from "../debris";
import { newRun, type TowerRun } from "../engine";

function runWithFloors(floors: number): TowerRun {
  const run = newRun(1, 0);
  const slabs = [...run.slabs];
  for (let i = 0; i < floors; i++) slabs.push({ left: -100, width: 200 });
  return { ...run, slabs };
}

describe("cameraTarget", () => {
  it("stays at the ground for a short tower and follows a tall one", () => {
    expect(cameraTarget(runWithFloors(0), 900).y).toBe(0);
    expect(cameraTarget(runWithFloors(30), 900).y).toBe(30 * 40 - 405);
  });

  it("centres on the top slab", () => {
    expect(cameraTarget(runWithFloors(2), 900).x).toBe(0);
  });
});

describe("stepCamera", () => {
  it("lands within 0.1% of the target after one second", () => {
    const target = { x: 0, y: 795 };
    const c = stepCamera({ x: 0, y: 0 }, target, 1000);
    expect(Math.abs(c.y - 795) / 795).toBeLessThan(0.001);
  });

  it("is frame-rate independent", () => {
    const target = { x: 40, y: 500 };
    const a = stepCamera(stepCamera({ x: 0, y: 0 }, target, 8), target, 8);
    const b = stepCamera({ x: 0, y: 0 }, target, 16);
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
  });
});

describe("debris", () => {
  it("falls and is removed once it has left the view", () => {
    let pieces = [spawnDebris({ left: 120, width: 30 }, 400, "right")];
    pieces = stepDebris(pieces, 100, 0);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.y).toBeLessThan(400);
    for (let i = 0; i < 50 && pieces.length > 0; i++) pieces = stepDebris(pieces, 100, 0);
    expect(pieces).toHaveLength(0);
  });

  it("spins a left cut counter-clockwise and a right cut clockwise", () => {
    const left = stepDebris([spawnDebris({ left: -150, width: 30 }, 400, "left")], 100, 0)[0];
    const right = stepDebris([spawnDebris({ left: 120, width: 30 }, 400, "right")], 100, 0)[0];
    expect(left?.angle).toBeLessThan(0);
    expect(right?.angle).toBeGreaterThan(0);
  });

  it("does not mutate the pieces it is given", () => {
    const piece = spawnDebris({ left: 0, width: 10 }, 100, "right");
    stepDebris([piece], 50, 0);
    expect(piece.y).toBe(100);
  });
});
