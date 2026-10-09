import { describe, expect, it } from "vitest";

import { describeOutcome } from "../messages";
import type { RunOutcome } from "../sandbox/run-client";
import { type SyntaxIssue, withSyntaxLine } from "../syntax-line";

const ISSUE: SyntaxIssue = { line: 4, column: 3, from: 30, to: 31 };
const syntax = (line: number | null): RunOutcome => ({
  kind: "compile-error",
  error: { kind: "syntax", message: "Unexpected token '}'", line },
});

describe("withSyntaxLine", () => {
  it("adds the editor's line to a syntax error that has none, so the message names it", () => {
    const outcome = withSyntaxLine(syntax(null), ISSUE);
    expect(describeOutcome(outcome)?.text).toBe("Line 4: Unexpected token '}'");
  });

  it("keeps a line the sandbox did give", () => {
    expect(withSyntaxLine(syntax(7), ISSUE)).toEqual(syntax(7));
  });

  it("changes nothing without an issue, or for any other outcome", () => {
    expect(withSyntaxLine(syntax(null), null)).toEqual(syntax(null));
    const other: RunOutcome = {
      kind: "compile-error",
      error: { kind: "no-player", message: "You must define a Player class.", line: null },
    };
    expect(withSyntaxLine(other, ISSUE)).toBe(other);
    const finished: RunOutcome = { kind: "finished", log: "1:", thoughts: [] };
    expect(withSyntaxLine(finished, ISSUE)).toBe(finished);
  });
});
