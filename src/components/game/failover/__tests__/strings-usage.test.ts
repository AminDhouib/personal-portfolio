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

function usedKeys(): Set<string> {
  const used = new Set<string>();
  for (const file of [...sources(ROOT), path.join(ROOT, "..", "failover.tsx")]) {
    for (const match of readFileSync(file, "utf8").matchAll(/\bT\.([a-z][a-z0-9_]*)\b/g)) {
      used.add(match[1] as string);
    }
  }
  return used;
}

describe("Failover UI strings", () => {
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
