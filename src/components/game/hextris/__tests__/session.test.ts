import { describe, expect, it } from "vitest";
import { isRecordableRun } from "../session";

describe("isRecordableRun", () => {
  it("rejects a 0-point run", () => {
    expect(isRecordableRun(0)).toBe(false);
  });

  it("accepts a positive score", () => {
    expect(isRecordableRun(1)).toBe(true);
  });

  it("rejects a negative score", () => {
    expect(isRecordableRun(-5)).toBe(false);
  });
});
