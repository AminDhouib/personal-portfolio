import { describe, it, expect } from "vitest";
import { applyFormatRange, countFormatted } from "../rich-input";

describe("applyFormatRange", () => {
  it("extends a short formatting array to cover the given range", () => {
    const fmt = applyFormatRange([], 2, 5, { bold: true });
    expect(fmt.length).toBe(5);
    expect(fmt[0]).toEqual({});
    expect(fmt[1]).toEqual({});
    expect(fmt[2]).toEqual({ bold: true });
    expect(fmt[3]).toEqual({ bold: true });
    expect(fmt[4]).toEqual({ bold: true });
  });

  it("merges with existing formatting rather than replacing", () => {
    const initial = [{ italic: true }, { italic: true }, { italic: true }];
    const fmt = applyFormatRange(initial, 0, 2, { bold: true });
    expect(fmt[0]).toEqual({ italic: true, bold: true });
    expect(fmt[1]).toEqual({ italic: true, bold: true });
    expect(fmt[2]).toEqual({ italic: true });
  });

  it("toggling bold off removes the attribute", () => {
    const initial = [{ bold: true }, { bold: true }];
    const fmt = applyFormatRange(initial, 0, 2, { bold: false });
    expect(fmt[0]).toEqual({});
    expect(fmt[1]).toEqual({});
  });
});

describe("countFormatted", () => {
  it("counts characters with the given attribute", () => {
    const fmt = [{ bold: true }, { italic: true }, { bold: true, italic: true }, {}];
    expect(countFormatted(fmt, "bold")).toBe(2);
    expect(countFormatted(fmt, "italic")).toBe(2);
  });

  it("returns 0 on an empty map", () => {
    expect(countFormatted([], "bold")).toBe(0);
  });
});
