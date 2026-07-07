import { describe, it, expect } from "vitest";
import { assertNever } from "../assert-never";

describe("assertNever", () => {
  it("throws", () => {
    expect(() => assertNever("x" as never)).toThrow();
  });

  it("includes the offending value and the context string in the message", () => {
    expect(() =>
      assertNever("bogus" as never, "game-loader: no renderer registered for slug"),
    ).toThrow(/bogus.*game-loader: no renderer registered for slug/);
  });

  it("omits the parenthesized context suffix when no context is given", () => {
    expect(() => assertNever(42 as never)).toThrow(/^assertNever: unhandled value 42$/);
  });
});
