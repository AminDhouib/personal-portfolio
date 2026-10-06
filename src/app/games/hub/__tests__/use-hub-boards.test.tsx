import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { fetchHubBoard, type HubBoardResult } from "../hub-boards";
import { TODAY_SOURCES, type TodaySource } from "../today-sources";
import { useHubBoards } from "../use-hub-boards";

vi.mock("../hub-boards", () => ({ fetchHubBoard: vi.fn() }));

const fetchMock = vi.mocked(fetchHubBoard);

function Probe({ sources }: { sources: readonly TodaySource[] }) {
  const { ref, boards } = useHubBoards(sources);
  return (
    <section ref={ref} data-testid="probe">
      {sources.map((source) => (
        <p key={source.slug} data-testid={source.slug}>
          {boards[source.slug]?.status ?? "idle"}
        </p>
      ))}
    </section>
  );
}

class FakeObserver {
  static instances: FakeObserver[] = [];
  callback: (entries: IntersectionObserverEntry[]) => void;
  options: IntersectionObserverInit | undefined;
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(
    callback: (entries: IntersectionObserverEntry[]) => void,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.options = options;
    FakeObserver.instances.push(this);
  }
}

function entry(isIntersecting: boolean): IntersectionObserverEntry {
  return { isIntersecting } as IntersectionObserverEntry;
}

describe("useHubBoards", () => {
  beforeEach(() => {
    FakeObserver.instances = [];
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ status: "ok", rows: [] });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("starts at once where IntersectionObserver is missing", async () => {
    expect(typeof IntersectionObserver).toBe("undefined");
    render(<Probe sources={TODAY_SOURCES} />);
    expect(await screen.findAllByText("ok")).toHaveLength(TODAY_SOURCES.length);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([...TODAY_SOURCES]);
    expect(fetchMock.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
  });

  it("waits until the strip is within 200px of the viewport", async () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    render(<Probe sources={TODAY_SOURCES} />);
    const observer = FakeObserver.instances[0];
    expect(observer?.options?.rootMargin).toBe("200px");
    expect(observer?.observe).toHaveBeenCalledWith(screen.getByTestId("probe"));
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      observer?.callback([entry(false)]);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      observer?.callback([entry(true)]);
    });
    expect(await screen.findAllByText("ok")).toHaveLength(TODAY_SOURCES.length);
    expect(fetchMock).toHaveBeenCalledTimes(TODAY_SOURCES.length);
    expect(observer?.disconnect).toHaveBeenCalled();
  });

  it("starts only once, however often the observer fires", async () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    render(<Probe sources={TODAY_SOURCES} />);
    const observer = FakeObserver.instances[0];
    act(() => {
      observer?.callback([entry(true)]);
      observer?.callback([entry(true)]);
    });
    await screen.findAllByText("ok");
    expect(fetchMock).toHaveBeenCalledTimes(TODAY_SOURCES.length);
  });

  it("under StrictMode leaves one live request set and ignores the aborted first one", async () => {
    const pending: Array<{
      signal: AbortSignal | undefined;
      resolve: (result: HubBoardResult) => void;
    }> = [];
    fetchMock.mockImplementation(
      (_source, signal) =>
        new Promise<HubBoardResult>((resolve) => {
          pending.push({ signal, resolve });
        }),
    );
    render(
      <StrictMode>
        <Probe sources={TODAY_SOURCES} />
      </StrictMode>,
    );
    const count = TODAY_SOURCES.length;
    // The double-invoked effect started two request sets; the first is aborted, the second live.
    expect(pending).toHaveLength(count * 2);
    const first = pending.slice(0, count);
    const second = pending.slice(count);
    for (const request of first) expect(request.signal?.aborted).toBe(true);
    for (const request of second) expect(request.signal?.aborted).toBe(false);

    // The aborted set settling late must not set state.
    await act(async () => {
      for (const request of first) request.resolve({ status: "error" });
    });
    for (const source of TODAY_SOURCES) {
      expect(screen.getByTestId(source.slug)).toHaveTextContent("idle");
    }

    await act(async () => {
      for (const request of second) request.resolve({ status: "ok", rows: [] });
    });
    for (const source of TODAY_SOURCES) {
      expect(screen.getByTestId(source.slug)).toHaveTextContent("ok");
    }
  });

  it("records an error result", async () => {
    fetchMock.mockResolvedValue({ status: "error" });
    render(<Probe sources={TODAY_SOURCES} />);
    expect(await screen.findAllByText("error")).toHaveLength(TODAY_SOURCES.length);
  });

  it("aborts its reads on unmount", () => {
    fetchMock.mockReturnValue(new Promise<HubBoardResult>(() => {}));
    const { unmount } = render(<Probe sources={TODAY_SOURCES} />);
    const signal = fetchMock.mock.calls[0]?.[1];
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("disconnects the observer and never reads if it unmounts before the strip is near", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const { unmount } = render(<Probe sources={TODAY_SOURCES} />);
    unmount();
    expect(FakeObserver.instances[0]?.disconnect).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
