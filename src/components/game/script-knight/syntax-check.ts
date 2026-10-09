import { javascriptLanguage } from "@codemirror/lang-javascript";

import type { SyntaxIssue } from "./syntax-line";

/**
 * Parses the code with the JavaScript grammar the editor already carries and returns the first
 * error node, or null. The grammar recovers from errors, so this finds where the code stops being
 * valid, not why; the sandbox still gives the engine's message when the code is run. Only the
 * lazy editor chunk imports this module.
 */
export function findSyntaxError(text: string): SyntaxIssue | null {
  const tree = javascriptLanguage.parser.parse(text);
  let found: { from: number; to: number } | null = null;
  tree.iterate({
    enter(node) {
      if (found) return false;
      if (node.type.isError) {
        found = { from: node.from, to: node.to };
        return false;
      }
      return undefined;
    },
  });
  if (!found) return null;
  const { from, to } = found as { from: number; to: number };
  // A zero-width error at the end of the text (an unclosed block) lands on the last line.
  const lines = text.slice(0, from).split("\n");
  const line = lines.length;
  return { line, column: (lines[line - 1]?.length ?? 0) + 1, from, to };
}
