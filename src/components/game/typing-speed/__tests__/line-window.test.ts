// @vitest-environment node
import { describe, expect, it } from "vitest";
import { nextTrim } from "../line-window";

describe("nextTrim", () => {
  it("drops nothing while the cursor is on the first line", () => {
    expect(nextTrim([0, 0, 0, 0], 3)).toBe(0);
  });
  it("drops nothing on the second line", () => {
    expect(nextTrim([0, 0, 0, 30, 30], 4)).toBe(0);
  });
  it("drops the first line when the cursor reaches the first word of the third line", () => {
    expect(nextTrim([0, 0, 0, 30, 30, 60, 60], 5)).toBe(3);
  });
  it("counts the words of a first line of unequal length", () => {
    expect(nextTrim([0, 0, 30, 30, 30, 30, 60, 60], 7)).toBe(2);
    expect(nextTrim([0, 0, 0, 0, 0, 30, 60], 6)).toBe(5);
  });
  it("keeps dropping while the cursor is below the third line", () => {
    expect(nextTrim([0, 0, 30, 30, 60, 60, 90], 6)).toBe(2);
  });
  it("tolerates sub-pixel differences within a line", () => {
    expect(nextTrim([0, 0.4, 30, 30.3, 60.2], 4)).toBe(2);
  });
  it("is 0 for no words or a cursor outside them", () => {
    expect(nextTrim([], 0)).toBe(0);
    expect(nextTrim([0, 30, 60], 9)).toBe(0);
  });
});
