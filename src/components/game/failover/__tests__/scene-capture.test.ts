import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFailoverScene } from "../scene/scene";

// scene.capture() for the share card, with three's WebGLRenderer swapped for a
// stand-in (jsdom has no WebGL): a live context gives a copy of a fresh frame,
// a lost one gives null, so the dialog says the image could not be made
// instead of saving a blank board under a correct band.

const gl = vi.hoisted(() => ({ lost: false, renders: 0 }));

vi.mock("three", async (importOriginal) => {
  const real = await importOriginal<typeof import("three")>();
  class FakeRenderer {
    setPixelRatio() {}
    setClearColor() {}
    setSize() {}
    render() {
      gl.renders++;
    }
    getContext() {
      return { isContextLost: () => gl.lost };
    }
    dispose() {}
    forceContextLoss() {}
  }
  return { ...real, WebGLRenderer: FakeRenderer };
});

beforeEach(() => {
  gl.lost = false;
  gl.renders = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({
    drawImage: () => undefined,
  })) as unknown as HTMLCanvasElement["getContext"]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function board(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  return canvas;
}

describe("scene.capture", () => {
  it("renders a fresh frame and copies it out at the board's size", () => {
    const scene = createFailoverScene(board(), "high");
    const shot = scene.capture();
    expect(gl.renders).toBe(1);
    expect(shot).not.toBeNull();
    expect([shot!.width, shot!.height]).toEqual([640, 360]);
    scene.dispose();
  });

  it("gives null when the WebGL context is lost, and draws nothing", () => {
    const scene = createFailoverScene(board(), "high");
    gl.lost = true;
    expect(scene.capture()).toBeNull();
    expect(gl.renders).toBe(0);
    scene.dispose();
  });
});
