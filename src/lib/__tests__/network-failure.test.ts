import { describe, it, expect } from "vitest";
import { isNetworkFailure } from "../network-failure";

describe("isNetworkFailure", () => {
  it.each([
    "Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "Load failed",
    "Network request failed",
  ])("is true for the TypeError %s", (message) => {
    expect(isNetworkFailure(new TypeError(message))).toBe(true);
  });

  it("is false for other TypeErrors, other error classes and non-errors", () => {
    expect(isNetworkFailure(new TypeError("x is undefined"))).toBe(false);
    expect(isNetworkFailure(new Error("Failed to fetch"))).toBe(false);
    expect(isNetworkFailure(new DOMException("timeout", "TimeoutError"))).toBe(false);
    expect(isNetworkFailure("Failed to fetch")).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
  });
});
