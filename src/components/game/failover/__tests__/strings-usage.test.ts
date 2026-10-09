// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { T, fmt } from "../strings";

// The UI strings and their uses stay one list (upstream's i18n-usage test, here
// for T.<key>): every key the game names exists (TypeScript checks that too),
// and every key in strings.ts is named somewhere, so dead text cannot pile up.
// The file is ASCII only, with no emoji and none of the upstream branding.

const ROOT = path.resolve(__dirname, "..");
const STRINGS = path.join(ROOT, "strings.ts");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" || entry.name === "sim" ? [] : sources(full);
    }
    return /\.tsx?$/.test(entry.name) && full !== STRINGS ? [full] : [];
  });
}

/** Strip comments, keeping string literals intact so a `//` in a URL survives. */
function stripComments(text: string): string {
  return text.replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (_match, literal: string | undefined) => literal ?? "",
  );
}

/** The T.<key> names a source uses; a key named only in a comment is not a use. */
function keysIn(text: string): string[] {
  return [...stripComments(text).matchAll(/\bT\.([a-z][a-z0-9_]*)\b/g)].map(
    (match) => match[1] as string,
  );
}

function usedKeys(): Set<string> {
  const used = new Set<string>();
  for (const file of [...sources(ROOT), path.join(ROOT, "..", "failover.tsx")]) {
    for (const key of keysIn(readFileSync(file, "utf8"))) used.add(key);
  }
  return used;
}

describe("Failover UI strings", () => {
  it("counts a key named only in a comment as unused", () => {
    const source = [
      "// Shows T.planted_line when the run ends.",
      "/* T.planted_block, see T.planted_too */",
      'const url = "https://example.com//T.in_a_string";',
      "const label = T.real_use; // and T.planted_tail",
    ].join("\n");
    expect(keysIn(source)).toEqual(["in_a_string", "real_use"]);
  });

  it("names every key it defines, and defines every key it names", () => {
    const used = usedKeys();
    expect([...used].sort()).toEqual(Object.keys(T).sort());
  });

  it("is ASCII only, with no emoji and no upstream branding", () => {
    const text = readFileSync(STRINGS, "utf8");
    expect([...text].filter((c) => c !== "\n" && (c < " " || c > "~"))).toEqual([]);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    for (const value of Object.values(T)) {
      expect(value).not.toMatch(/survival protocol|SERVER:/i);
      expect(value).not.toMatch(/<[a-z/][^>]*>/i);
      expect(value.trim()).toBe(value);
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("fills placeholders, and leaves an unfilled or inherited one alone", () => {
    expect(fmt(T.link_made, { from: "Internet", to: "Firewall" })).toBe(
      "Linked Internet to Firewall",
    );
    expect(fmt("{a} and {b}", { a: 1 })).toBe("1 and {b}");
    expect(fmt("{constructor}", {})).toBe("{constructor}");
  });
});
