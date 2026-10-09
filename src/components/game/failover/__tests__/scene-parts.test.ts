// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cameraPose,
  initialCamera,
  orbit,
  panByKey,
  panByPixels,
  projectToView,
  toggleView,
  zoomBy,
} from "../scene/camera";
import { LINK_Y, writeConnectionSegments } from "../scene/connections";
import { diffIds, nodeShape, nodeStyle } from "../scene/nodes";
import { ACCENT, DISABLED_COLOR, SERVICE_COLORS, TRAFFIC_COLORS } from "../scene/palette";
import { cellAt, groundPoint, nodeAt, pickNode } from "../scene/pick";
import { REQUEST_Y, writeRequestInstances, type Rgb } from "../scene/requests";
import { dispatch } from "../sim/action-log";
import { SERVICE_TYPES, TRAFFIC_TYPES } from "../sim/config";
import { snapshot, type RequestSnapshot, type ServiceSnapshot } from "../sim/snapshot";
import { resetSim } from "../sim/state";

afterEach(() => {
  resetSim({ seed: "scene-parts-reset" });
});

/** A small real board: Internet -> WAF -> ALB -> Compute, through the sim's own dispatch. */
function board() {
  resetSim({ seed: "scene-parts", mode: "sandbox", budget: 100_000 });
  expect(dispatch({ op: 0, type: "waf", x: -28, z: 0 }).ok).toBe(true);
  expect(dispatch({ op: 0, type: "alb", x: -16, z: 0 }).ok).toBe(true);
  expect(dispatch({ op: 0, type: "compute", x: -4, z: 4 }).ok).toBe(true);
  expect(dispatch({ op: 1, from: "internet", to: "svc_1" }).ok).toBe(true);
  expect(dispatch({ op: 1, from: "svc_1", to: "svc_2" }).ok).toBe(true);
  expect(dispatch({ op: 1, from: "svc_2", to: "svc_3" }).ok).toBe(true);
  return snapshot();
}

describe("palette", () => {
  it("uses the site's accent tokens, exactly as globals.css defines them", () => {
    const css = readFileSync(path.resolve(__dirname, "../../../../app/globals.css"), "utf8");
    for (const [name, hex] of Object.entries(ACCENT)) {
      expect(css).toContain(`--color-accent-${name}: ${hex};`);
    }
  });

  it("gives every service and every traffic type an accent", () => {
    const accents = new Set<string>(Object.values(ACCENT));
    for (const type of SERVICE_TYPES) expect(accents.has(SERVICE_COLORS[type])).toBe(true);
    for (const type of Object.keys(TRAFFIC_TYPES) as (keyof typeof TRAFFIC_TYPES)[]) {
      expect(accents.has(TRAFFIC_COLORS[type])).toBe(true);
    }
  });

  it("draws malicious traffic red", () => {
    expect(TRAFFIC_COLORS.MALICIOUS).toBe(ACCENT.red);
  });
});

describe("camera", () => {
  it("starts isometric on the board", () => {
    const pose = cameraPose(initialCamera());
    expect(pose.up).toEqual([0, 1, 0]);
    // 35.26 degrees above the ground: the isometric angle.
    const [px, py, pz] = pose.position;
    const [tx, , tz] = pose.target;
    const flat = Math.hypot(px - tx, pz - tz);
    expect((Math.atan2(py, flat) * 180) / Math.PI).toBeCloseTo(35.264, 2);
  });

  it("turns a quarter at a time and comes back after four", () => {
    let s = initialCamera();
    const start = cameraPose(s).position;
    s = orbit(s, 1);
    expect(s.quarter).toBe(1);
    // A quarter turn moves the camera round the target: the heading flips on one axis.
    expect(cameraPose(s).position[2] - s.z).toBeCloseTo(-(start[2] - s.z), 6);
    expect(cameraPose(s).position[0]).toBeCloseTo(start[0], 6);
    s = orbit(orbit(orbit(s, 1), 1), 1);
    expect(s.quarter).toBe(0);
    expect(orbit(initialCamera(), -1).quarter).toBe(3);
  });

  it("looks straight down in the top-down view", () => {
    const s = toggleView(initialCamera());
    const pose = cameraPose(s);
    expect(pose.position[0]).toBe(s.x);
    expect(pose.position[2]).toBe(s.z);
    expect(pose.up[1]).toBe(0);
    expect(toggleView(s).topDown).toBe(false);
  });

  it("clamps zoom and pan to the board", () => {
    expect(zoomBy(initialCamera(), 1000).zoom).toBe(4);
    expect(zoomBy(initialCamera(), 0.0001).zoom).toBe(0.6);
    expect(zoomBy(initialCamera(), -1)).toEqual(initialCamera());
    let s = initialCamera();
    for (let i = 0; i < 200; i++) s = panByKey(s, 1, 1);
    expect(Math.abs(s.x)).toBeLessThanOrEqual(60);
    expect(Math.abs(s.z)).toBeLessThanOrEqual(60);
  });

  it("moves the view the way the key points, on screen", () => {
    // Screen right, mapped back through the camera, has a positive dot with the move.
    for (const quarter of [0, 1, 2, 3] as const) {
      const s = { ...initialCamera(), x: 0, z: 0, quarter };
      const moved = panByKey(s, 1, 0);
      const pose = cameraPose(s);
      const fx = pose.target[0] - pose.position[0];
      const fz = pose.target[2] - pose.position[2];
      // right = forward x up = (-fz, fx) on the ground
      const dot = (moved.x - s.x) * -fz + (moved.z - s.z) * fx;
      expect(dot).toBeGreaterThan(0);
    }
  });

  it("drags the board with the pointer, and ignores a zero-height view", () => {
    const s = { ...initialCamera(), x: 0, z: 0 };
    // The board follows the pointer right, so the view centre moves the way D does not.
    const dragged = panByPixels(s, 100, 0, 800);
    const keyRight = panByKey(s, 1, 0);
    const dot = (dragged.x - s.x) * (keyRight.x - s.x) + (dragged.z - s.z) * (keyRight.z - s.z);
    expect(dot).toBeLessThan(0);
    // 100 px of an 800 px view at zoom 1 is a tenth of the 80-unit view height.
    expect(Math.hypot(dragged.x - s.x, dragged.z - s.z)).toBeCloseTo(10, 6);
    // Dragging down moves the view centre up the screen, the way W does.
    const down = panByPixels(s, 0, 100, 800);
    const keyUp = panByKey(s, 0, -1);
    expect((down.x - s.x) * (keyUp.x - s.x) + (down.z - s.z) * (keyUp.z - s.z)).toBeGreaterThan(0);
    expect(panByPixels(s, 100, 100, 0)).toBe(s);
  });
});

describe("projectToView", () => {
  const W = 800;
  const H = 600;

  it("puts the view centre in the middle, and nothing on an empty view", () => {
    for (const s of [initialCamera(), toggleView(initialCamera()), orbit(initialCamera(), 1)]) {
      const p = projectToView(s, [s.x, 0, s.z], W, H);
      expect(p?.x).toBeCloseTo(W / 2, 6);
      expect(p?.y).toBeCloseTo(H / 2, 6);
    }
    expect(projectToView(initialCamera(), [0, 0, 0], 0, H)).toBeNull();
  });

  it("maps one half-height of world straight up to the top edge, top-down", () => {
    const s = toggleView(initialCamera());
    const { up } = cameraPose(s);
    const half = cameraPose(s).halfHeight;
    const p = projectToView(s, [s.x + up[0] * half, 0, s.z + up[2] * half], W, H);
    expect(p?.x).toBeCloseTo(W / 2, 6);
    expect(p?.y).toBeCloseTo(0, 6);
  });

  it("moves a point right on screen the way a drag to the left pans the view", () => {
    const s = initialCamera();
    const dragged = panByPixels(s, -100, 0, H);
    // The view centre moved right along the ground: the old centre is now left of the middle.
    const p = projectToView(dragged, [s.x, 0, s.z], W, H);
    expect(p?.x).toBeCloseTo(W / 2 - 100, 6);
    expect(p?.y).toBeCloseTo(H / 2, 6);
  });

  it("draws a raised point higher on screen in the isometric view", () => {
    const s = initialCamera();
    const ground = projectToView(s, [s.x, 0, s.z], W, H)!;
    const raised = projectToView(s, [s.x, 4, s.z], W, H)!;
    expect(raised.x).toBeCloseTo(ground.x, 6);
    expect(raised.y).toBeLessThan(ground.y);
  });
});

describe("pick", () => {
  it("meets the ground where the ray crosses y = 0", () => {
    expect(groundPoint({ x: 0, y: 10, z: 0 }, { x: 1, y: -1, z: 0 })).toEqual({ x: 10, z: 0 });
    expect(groundPoint({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
    expect(groundPoint({ x: 0, y: 10, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull();
  });

  it("snaps to tile centres and refuses points off the board", () => {
    expect(cellAt({ x: 5.9, z: -2.1 })).toEqual({ x: 4, z: -4 });
    expect(cellAt({ x: -1.9, z: 1.9 })).toEqual({ x: 0, z: 0 });
    expect(Object.is(cellAt({ x: -0.1, z: 0 })?.x, -0)).toBe(false);
    expect(cellAt({ x: 63, z: 0 })).toBeNull();
    expect(cellAt({ x: 0, z: -70 })).toBeNull();
  });

  it("finds the node on a tile", () => {
    const snap = board();
    expect(nodeAt({ x: -40, z: 0 }, snap)).toBe("internet");
    expect(nodeAt({ x: -28, z: 0 }, snap)).toBe("svc_1");
    expect(nodeAt({ x: -4, z: 4 }, snap)).toBe("svc_3");
    expect(nodeAt({ x: 0, z: 0 }, snap)).toBeNull();
  });

  it("picks the Internet on the top half of its ball, where the ground cell behind it is empty", () => {
    const snap = board();
    const origin = { x: -40, y: 30, z: 30 };
    const dir = { x: 0, y: 3.5 - 30, z: -30 };
    const ground = groundPoint(origin, dir);
    const cell = ground ? cellAt(ground) : null;
    expect(cell).toEqual({ x: -40, z: -4 });
    expect(cell && nodeAt(cell, snap)).toBeNull();
    expect(pickNode(origin, dir, snap)).toEqual({ id: "internet", cell: { x: -40, z: 0 } });
  });

  it("picks the nearest node along the ray, against each node's own height", () => {
    const snap = board();
    expect(pickNode({ x: -60, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, snap)?.id).toBe("internet");
    expect(pickNode({ x: -22, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }, snap)).toEqual({
      id: "svc_1",
      cell: { x: -28, z: 0 },
    });
    // Over the tier-1 WAF and ALB (1.6 tall) and past the Compute one row over.
    expect(pickNode({ x: -34, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, snap)).toBeNull();
    // Pointing away from everything.
    expect(pickNode({ x: -22, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, snap)).toBeNull();
  });
});

describe("connection segments", () => {
  it("writes two vertices per link, at link height", () => {
    const snap = board();
    const buf = new Float32Array(64 * 3);
    expect(writeConnectionSegments(snap, buf)).toBe(6);
    expect(Array.from(buf.slice(0, 6))).toEqual([-40, LINK_Y, 0, -28, LINK_Y, 0].map(Math.fround));
    expect(Array.from(buf.slice(12, 18))).toEqual([-16, LINK_Y, 0, -4, LINK_Y, 4].map(Math.fround));
  });

  it("stops at the buffer's end and skips links to nodes it cannot find", () => {
    const snap = board();
    expect(writeConnectionSegments(snap, new Float32Array(5 * 3))).toBe(4);
    const broken = { ...snap, connections: [{ from: "svc_1", to: "svc_99" }, ...snap.connections] };
    expect(writeConnectionSegments(broken, new Float32Array(64 * 3))).toBe(6);
  });
});

describe("request instances", () => {
  const RED: Rgb = [1, 0, 0];
  const colorOf = (type: string): Rgb => (type === "READ" ? [0, 0, 1] : [0, 1, 0]);
  const req = (over: Partial<RequestSnapshot>): RequestSnapshot => ({
    id: 1,
    type: "READ",
    fromX: 0,
    fromZ: 0,
    toX: 10,
    toZ: -20,
    progress: 0.5,
    failed: false,
    ...over,
  });

  it("places each request along its hop, coloured by type", () => {
    const m = new Float32Array(16 * 4);
    const c = new Float32Array(3 * 4);
    const n = writeRequestInstances(
      [req({}), req({ type: "WRITE", progress: 0 })],
      4,
      m,
      c,
      colorOf,
      RED,
    );
    expect(n).toBe(2);
    expect(Array.from(m.slice(0, 16))).toEqual([
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      5,
      Math.fround(REQUEST_Y),
      -10,
      1,
    ]);
    expect(Array.from(m.slice(28, 31))).toEqual([0, Math.fround(REQUEST_Y), 0]);
    expect(Array.from(c.slice(0, 6))).toEqual([0, 0, 1, 0, 1, 0]);
  });

  it("draws a failed request larger and red", () => {
    const m = new Float32Array(16);
    const c = new Float32Array(3);
    writeRequestInstances([req({ failed: true })], 1, m, c, colorOf, RED);
    expect(m[0]).toBe(1.5);
    expect(Array.from(c)).toEqual([1, 0, 0]);
  });

  it("draws at most the tier's cap, whatever the sim is running", () => {
    const many = Array.from({ length: 400 }, (_, i) => req({ id: i }));
    const m = new Float32Array(16 * 150);
    const c = new Float32Array(3 * 150);
    expect(writeRequestInstances(many, 150, m, c, colorOf, RED)).toBe(150);
    expect(writeRequestInstances(many, 600, m, c, colorOf, RED)).toBe(150);
  });
});

describe("nodes", () => {
  const svc = (over: Partial<ServiceSnapshot>): ServiceSnapshot => ({
    ...board().services[0]!,
    ...over,
  });

  it("gives data stores, queues and the rest their own shapes", () => {
    expect(nodeShape("db")).toBe("cylinder");
    expect(nodeShape("sqs")).toBe("octahedron");
    expect(nodeShape("compute")).toBe("box");
  });

  it("grows with the tier, one more outline per tier up to three", () => {
    const t1 = nodeStyle(svc({ tier: 1 }), null);
    const t3 = nodeStyle(svc({ tier: 3 }), null);
    const t5 = nodeStyle(svc({ tier: 5 }), null);
    expect(t3.height).toBeGreaterThan(t1.height);
    expect([t1.outlines, t3.outlines, t5.outlines]).toEqual([1, 3, 3]);
  });

  it("fades with damage, turns red when critical, dims when out of service", () => {
    expect(nodeStyle(svc({ health: 100 }), null).opacity).toBe(1);
    expect(nodeStyle(svc({ health: 50 }), null).opacity).toBeLessThan(1);
    expect(nodeStyle(svc({ health: 50 }), null).color).toBe(SERVICE_COLORS.waf);
    expect(nodeStyle(svc({ type: "alb", health: 20 }), null).color).toBe(ACCENT.red);
    expect(nodeStyle(svc({ disabled: true }), null).color).toBe(DISABLED_COLOR);
  });

  it("shows a flash over everything else", () => {
    expect(nodeStyle(svc({ disabled: true }), "#ffffff").color).toBe("#ffffff");
  });

  it("diffs the drawn ids against the snapshot", () => {
    expect(diffIds(new Set(["a", "b"]), [{ id: "b" }, { id: "c" }])).toEqual({
      added: ["c"],
      removed: ["a"],
    });
  });
});
