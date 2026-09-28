import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

// The probe's answer is kept for the life of the page, so every test loads a
// fresh copy of the module to ask again.
async function loadWebGLOnly() {
  vi.resetModules();
  return (await import("../webgl-only")).WebGLOnly;
}

/** Stubs canvas.getContext: `webgl2` answers with `context`, every other type with null. */
function stubWebGL2(context: unknown) {
  return vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(((type: string) => (type === "webgl2" ? context : null)) as never);
}

function fakeContext() {
  const loseContext = vi.fn();
  return {
    context: {
      getExtension: (name: string) => (name === "WEBGL_lose_context" ? { loseContext } : null),
    },
    loseContext,
  };
}

describe("WebGLOnly", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("mounts its children where a WebGL2 context can be created", async () => {
    stubWebGL2(fakeContext().context);
    const WebGLOnly = await loadWebGLOnly();
    render(
      <WebGLOnly fallback={<p>no webgl</p>}>
        <p>scene</p>
      </WebGLOnly>,
    );
    expect(screen.getByText("scene")).toBeInTheDocument();
    expect(screen.queryByText("no webgl")).not.toBeInTheDocument();
  });

  it("releases the probe's context at once, so it never holds one of the browser's few", async () => {
    const { context, loseContext } = fakeContext();
    stubWebGL2(context);
    const WebGLOnly = await loadWebGLOnly();
    render(<WebGLOnly>scene</WebGLOnly>);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("renders the fallback, and never the children, where WebGL is off", async () => {
    stubWebGL2(null);
    const WebGLOnly = await loadWebGLOnly();
    render(
      <WebGLOnly fallback={<p>no webgl</p>}>
        <p>scene</p>
      </WebGLOnly>,
    );
    expect(screen.getByText("no webgl")).toBeInTheDocument();
    expect(screen.queryByText("scene")).not.toBeInTheDocument();
  });

  it("treats a probe that throws as no WebGL", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      throw new Error("blocked");
    });
    const WebGLOnly = await loadWebGLOnly();
    render(
      <WebGLOnly fallback={<p>no webgl</p>}>
        <p>scene</p>
      </WebGLOnly>,
    );
    expect(screen.getByText("no webgl")).toBeInTheDocument();
  });

  it("asks once per page load, however many scenes are gated", async () => {
    const getContext = stubWebGL2(fakeContext().context);
    const WebGLOnly = await loadWebGLOnly();
    render(
      <>
        <WebGLOnly>
          <p>first scene</p>
        </WebGLOnly>
        <WebGLOnly>
          <p>second scene</p>
        </WebGLOnly>
      </>,
    );
    expect(screen.getByText("first scene")).toBeInTheDocument();
    expect(screen.getByText("second scene")).toBeInTheDocument();
    expect(getContext).toHaveBeenCalledTimes(1);
  });

  it("renders the pending placeholder on the server, where support is unknown", async () => {
    const getContext = stubWebGL2(fakeContext().context);
    const WebGLOnly = await loadWebGLOnly();
    const html = renderToString(
      <WebGLOnly pending={<p>loading</p>} fallback={<p>no webgl</p>}>
        <p>scene</p>
      </WebGLOnly>,
    );
    expect(html).toContain("loading");
    expect(html).not.toContain("scene");
    expect(html).not.toContain("no webgl");
    expect(getContext).not.toHaveBeenCalled();
  });
});
