import type { RunOutcome } from "./sandbox/run-client";

/** Where the editor's own parse found a syntax error: 1-based line and column, and offsets. */
export interface SyntaxIssue {
  line: number;
  column: number;
  from: number;
  to: number;
}

/**
 * The sandbox reports a syntax error with the engine's message but, in V8, no line. When the
 * editor has already found the error's line, add it, so the message reads "Line 4: Unexpected
 * token '}'" through the same path as every other compile error. Any other outcome, or a line
 * the sandbox did give, is left alone.
 */
export function withSyntaxLine(outcome: RunOutcome, issue: SyntaxIssue | null): RunOutcome {
  if (
    issue === null ||
    outcome.kind !== "compile-error" ||
    outcome.error.kind !== "syntax" ||
    outcome.error.line !== null
  ) {
    return outcome;
  }
  return { kind: "compile-error", error: { ...outcome.error, line: issue.line } };
}
