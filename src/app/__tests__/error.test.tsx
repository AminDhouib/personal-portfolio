import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ErrorPage from "../error";

// Next passes the boundary's recovery callback as `retry` (stable since 16.3; it was
// `unstable_retry` in 16.2). If the prop name drifts again, "Try again" calls undefined.
describe("route error boundary", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("calls retry when Try again is clicked", () => {
    vi.stubGlobal("reportError", vi.fn());
    const retry = vi.fn();
    render(<ErrorPage error={new Error("boom")} retry={retry} />);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
