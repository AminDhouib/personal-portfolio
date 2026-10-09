// @vitest-environment node
import { describe, expect, it } from "vitest";

import { STARTER } from "../starter";
import { findSyntaxError } from "../syntax-check";

describe("findSyntaxError", () => {
  it("is null for the starter and for ordinary code", () => {
    expect(findSyntaxError(STARTER)).toBeNull();
    expect(
      findSyntaxError(
        "class Player {\n  playTurn(warrior) {\n    if (warrior.feel().isEmpty()) {\n      warrior.walk();\n    } else {\n      warrior.attack();\n    }\n  }\n}\n",
      ),
    ).toBeNull();
    expect(findSyntaxError("")).toBeNull();
  });

  it("reports the line and column of a bad token", () => {
    const issue = findSyntaxError("class Player {\n  playTurn(w) {\n    let x = ;\n  }\n}\n");
    expect(issue?.line).toBe(3);
    expect(issue?.column).toBeGreaterThan(0);
  });

  it("reports a missing closing brace at the end of the code", () => {
    const issue = findSyntaxError("class Player {\n  playTurn(w) {\n    w.walk();\n  }\n");
    expect(issue).not.toBeNull();
    expect(issue?.line).toBeGreaterThanOrEqual(4);
  });

  it("reports a stray closing brace on its own line", () => {
    const issue = findSyntaxError("class Player {\n  playTurn(w) {}\n}\n}\n");
    expect(issue?.line).toBe(4);
  });

  it("gives offsets inside the text", () => {
    const text = "const a = (;\n";
    const issue = findSyntaxError(text);
    expect(issue).not.toBeNull();
    expect(issue?.from).toBeGreaterThanOrEqual(0);
    expect(issue?.to).toBeLessThanOrEqual(text.length);
    expect(issue?.to).toBeGreaterThanOrEqual(issue?.from ?? 0);
  });
});
