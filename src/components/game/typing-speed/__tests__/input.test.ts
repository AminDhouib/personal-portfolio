// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SENTINEL as S, diffInput } from "../engine/input";

describe("diffInput", () => {
  it("an appended letter is one char op", () => {
    expect(diffInput(S + "ab", S + "abc", "insertText")).toEqual({
      ops: [{ kind: "char", ch: "c" }],
      bulk: false,
      rejected: false,
    });
  });
  it("a typed space is a space op", () => {
    expect(diffInput(S + "ab", S + "ab ", "insertText").ops).toEqual([{ kind: "space" }]);
  });
  it("deleting letters is one back op each", () => {
    expect(diffInput(S + "abc", S + "a", "deleteContentBackward").ops).toEqual([
      { kind: "back" },
      { kind: "back" },
    ]);
  });
  it("deleting the sentinel is a back op at the start of the word", () => {
    expect(diffInput(S, "", "deleteContentBackward").ops).toEqual([{ kind: "back" }]);
  });
  it("deleteWordBackward is one backWord op", () => {
    expect(diffInput(S + "abc", S, "deleteWordBackward").ops).toEqual([{ kind: "backWord" }]);
  });
  it.each(["insertFromPaste", "insertFromDrop", "insertFromYank", "insertFromPasteAsQuotation"])(
    "%s is rejected with no ops (audit bug 6)",
    (inputType) => {
      expect(diffInput(S + "a", S + "a pasted text", inputType)).toEqual({
        ops: [],
        bulk: false,
        rejected: true,
      });
    },
  );
  it("one event inserting several letters is applied but flagged bulk", () => {
    expect(diffInput(S + "th", S + "there ", "insertText")).toEqual({
      ops: [
        { kind: "char", ch: "e" },
        { kind: "char", ch: "r" },
        { kind: "char", ch: "e" },
        { kind: "space" },
      ],
      bulk: true,
      rejected: false,
    });
  });
  it("a letter plus a space in one event is not bulk", () => {
    expect(diffInput(S + "th", S + "the ", "insertText").bulk).toBe(false);
  });
  it("a replacement rewinds to the common prefix, retypes, and is bulk", () => {
    expect(diffInput(S + "teh", S + "the", "insertReplacementText")).toEqual({
      ops: [
        { kind: "back" },
        { kind: "back" },
        { kind: "char", ch: "h" },
        { kind: "char", ch: "e" },
      ],
      bulk: true,
      rejected: false,
    });
  });
  it("composition updates diff like plain typing", () => {
    expect(diffInput(S + "wo", S + "wor", "insertCompositionText").ops).toEqual([
      { kind: "char", ch: "r" },
    ]);
  });
});
